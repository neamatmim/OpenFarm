import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import {
  OPEN_INSTANCE_STATES,
  awaitsSignOff,
  isEscalated,
  isOverdue,
  minutesOverdue,
  sessionsPerDayOf,
  underMilkWithdrawal,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { doersOf, raiseAlerts } from "../alerts-store";
import type { Tx } from "../audit";
import { audited } from "../audit";
import { pregnancyTimesOf } from "../breeding-store";
import { stepOf } from "../completion-store";
import type { Context } from "../context";
import { correct, reasonInput } from "../corrections/correction";
import {
  stepCorrection,
  stepCorrectionInput,
} from "../corrections/step-completion";
import { factsAsShown, recordedFactsOf } from "../effects/effect";
import { claimEntry } from "../entries/claim";
import { recordNow } from "../entries/entry";
import { finishEntry } from "../entries/finish";
import {
  stepCompletionEntry,
  stepCompletionInput,
} from "../entries/step-completion";
import { stepPhotoEntry, stepPhotoInput } from "../entries/step-photo";
import { feedingTargetForPen } from "../feed-store";
import { requirePen } from "../herd-store";
import { protectedProcedure } from "../index";
import type { RaisedAlert } from "../instances-store";
import {
  workAwaitingSignOff,
  alertParams,
  animalsForInstance,
  dueSlotsFor,
  farmDayOf,
  happeningSlotsFor,
  renewalSlotsFor,
  farmDayRange,
  findLate,
  raiseDueInstances,
  heatThatRaised,
  recentHappenings,
  whatChangedFor,
} from "../instances-store";
import { pushRaised } from "../push-send";
import { tellOfRenewals } from "../registration-store";
import { raiseNeedsReview } from "../review-store";
import { requireRole } from "../roles";
import { isWorkInScope, requireWorkInScope, workInScopeWhere } from "../scope";
import { contentOf } from "../sop-content";
import {
  readWork,
  requireMayTransition,
  requireTransition,
} from "../work-transitions";

const MINUTE_MS = 60_000;

/** How much of the sign-off queue a screen is handed at once. */
const SIGN_OFF_LIMIT = 100;

/**
 * Loads the Instance a checker may sign off, refusing if they may not: it must be waiting
 * for sign-off, and waiting on a Role they hold. Holding some other Role is not enough — the
 * Version named who checks this work. The Owner may always step in, the same licence they
 * have elsewhere.
 */
const loadCheckableInstance = async (
  tx: Tx,
  context: { farm: { id: string }; roles: string[]; actor: { id: string } },
  id: string
) => {
  const instance = await tx.query.sopInstance.findFirst({
    where: { id, farmId: context.farm.id },
    with: {
      version: { columns: { content: true } },
      pen: {
        columns: { name: true },
        with: { shed: { columns: { name: true } } },
      },
    },
  });
  if (!instance) {
    throw new ORPCError("NOT_FOUND");
  }
  // Waiting for sign-off: done, and done since somebody signed it off or sent it back.
  requireMayTransition(instance, "approve");
  if (!(awaitsSignOff(instance) && instance.checkerRole)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This work is not checked by anyone",
    });
  }
  const mayCheck =
    context.roles.includes(instance.checkerRole) ||
    context.roles.includes("owner");
  if (!mayCheck) {
    throw new ORPCError("FORBIDDEN", {
      message: `This work is signed off by ${instance.checkerRole}`,
    });
  }
  // Marking your own work as checked is not a check.
  const doer = instance.claimedBy ?? instance.assignedTo;
  if (doer === context.actor.id) {
    throw new ORPCError("FORBIDDEN", {
      message: "Work is signed off by someone other than the person who did it",
    });
  }
  return instance;
};

/**
 * Work for a Heat whose AI window had already closed by the time the farm heard about it.
 *
 * On a farm whose sheds have no signal this is an ordinary morning, not an edge: a sighting at
 * dawn reaches the farm when the phone does. The work is still raised — the barn wrote the heat
 * down, and it is never dropped (ADR 0002) — but it goes on the Manager's queue too, so a missed
 * service window is put down to a phone's lag and not to somebody's negligence, and so the
 * Manager can decide whether she is still worth serving.
 *
 * Only work raised on this pass: a job already on the list was flagged the first time, or was
 * not late then.
 */
const flagHeatsThatArrivedTooLate = async (
  tx: Tx,
  farmId: string,
  raised: { id: string; cause: string | null }[],
  slots: {
    cause?: string | null;
    dueAt: Date;
    graceMinutes: number;
    animalId?: string | null;
  }[],
  eventId: string,
  now: Date
) => {
  const slotsByCause = new Map(
    slots.flatMap((slot) => (slot.cause ? [[slot.cause, slot]] : []))
  );
  for (const work of raised) {
    const slot = work.cause ? slotsByCause.get(work.cause) : undefined;
    const windowShut =
      slot !== undefined &&
      heatThatRaised(work.cause) !== null &&
      slot.dueAt.getTime() + slot.graceMinutes * MINUTE_MS <= now.getTime();
    if (windowShut) {
      // Sequential: one Needs Review each, in the order the work was raised.
      // oxlint-disable-next-line no-await-in-loop
      await raiseNeedsReview(
        tx,
        farmId,
        {
          entity: "sop_instance",
          entityId: work.id,
          reason: "late_entry",
          auditEventId: eventId,
          params: { why: "heat_after_window", closedAt: slot.dueAt },
        },
        now
      );
    }
  }
};

/** The day's work, raised: every schedule slot due by now, and the work things that happened call for. Idempotent — a
 *  slot already raised is not raised again — so the server's own timer and whoever opens the app can both run it. */
export const raiseTheDaysWork = async (
  context: Context & { farm: NonNullable<Context["farm"]> }
) => {
  const now = context.clock.now();
  const definitions = await context.db.query.sopDefinition.findMany({
    where: { farmId: context.farm.id, retiredAt: { isNull: true } },
    with: { currentVersion: true },
  });
  const sops = definitions
    .filter((definition) => definition.currentVersion)
    .map((definition) => ({
      definitionId: definition.id,
      versionId: definition.currentVersion?.id ?? "",
      content: contentOf({ content: definition.currentVersion?.content }),
      triggersInForceSince:
        definition.currentVersion?.publishedAt ?? definition.createdAt,
    }));
  const animals = await context.db.query.animal.findMany({
    where: { farmId: context.farm.id },
    columns: { penId: true, side: true, state: true },
  });
  const breeding = {
    aiWindow: {
      startHours: context.farm.aiWindowStartHours,
      endHours: context.farm.aiWindowEndHours,
    },
    pregnancyCheckAfterDays: context.farm.pregnancyCheckAfterDays,
    calvingLeadDays: pregnancyTimesOf(context.farm).calvingLeadDays,
  };
  const slots = [
    ...dueSlotsFor(now, sops, animals),
    // Work the clock does not raise: a Move, an arrival, a cow reaching a State. Same
    // pass, because whatever opened the app wants the whole day's work, not the half
    // of it a schedule accounts for.
    ...happeningSlotsFor(
      now,
      sops,
      await recentHappenings(context.db, context.farm.id, now, breeding),
      breeding
    ),
    // Work about the whole farm: its Registration coming up for renewal.
    ...renewalSlotsFor(now, sops, {
      expiresOn: context.farm.registrationExpiresOn,
      renewalLeadDays: context.farm.registrationRenewalLeadDays,
    }),
  ];
  if (slots.length === 0) {
    return { raised: 0 };
  }
  let raised = 0;
  await audited(context).write(
    {
      entity: "sop_instance",
      entityId: `schedule:${now.toISOString().slice(0, 10)}`,
      action: "create",
      after: { slots: slots.length },
    },
    async (tx, eventId) => {
      const instances = await raiseDueInstances(
        tx,
        context.farm.id,
        slots,
        now
      );
      raised = instances.length;
      // The Owner hears of a renewal in the evening's post, the day its work is raised.
      await tellOfRenewals(tx, context.farm, instances, now);
      await flagHeatsThatArrivedTooLate(
        tx,
        context.farm.id,
        instances,
        slots,
        eventId,
        now
      );
    }
  );
  return { raised };
};

export const instancesRouter = {
  /**
   * Raises the Instances the farm's day needs. Idempotent, so the phone and the office can
   * both call it on open; a scheduled job replaces that later.
   */
  ensureDue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) => raiseTheDaysWork(context)),

  /**
   * Raises one piece of work now, for one Pen, because somebody has decided to do it today: a
   * deworming, a vaccination round, a job the Playbook holds but no schedule should raise.
   *
   * The alternative is worse than it sounds. A campaign has to be raised somehow, and the only
   * other shape the Playbook offers is a time of day — which would put a deworming on the
   * shed's list every morning for ever. The farm decides when a campaign happens; the Playbook
   * says what it is.
   */
  raiseNow: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ definitionId: z.string(), penId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const definition = await context.db.query.sopDefinition.findFirst({
        where: {
          id: input.definitionId,
          farmId: context.farm.id,
          retiredAt: { isNull: true },
        },
        with: { currentVersion: true },
      });
      if (!definition?.currentVersion) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such procedure, or nothing published in it yet",
        });
      }
      const content = contentOf(definition.currentVersion);
      // A dose of a Prescription is raised by the Prescription, and raising one by hand would
      // be a dose belonging to no course.
      if (content.triggers.some((trigger) => trigger.kind === "prescription")) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A prescription raises this work, one dose at a time",
          data: { refusal: "prescription_raises_it" },
        });
      }
      let raised = 0;
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: `${input.definitionId}:${now.toISOString()}`,
          action: "create",
          after: { definitionId: input.definitionId, penId: input.penId },
        },
        async (tx) => {
          // Inside the transaction, like every other read a write depends on: a Pen deleted
          // between the check and the insert would leave work standing in nowhere.
          await requirePen(tx, context.farm.id, input.penId);
          const instances = await raiseDueInstances(
            tx,
            context.farm.id,
            [
              {
                definitionId: definition.id,
                versionId: definition.currentVersion?.id ?? "",
                penId: input.penId,
                dueAt: now,
                // Named for who asked and when, so asking twice by accident raises one piece
                // of work rather than two.
                cause: `byHand:${input.penId}:${farmDayOf(now)}`,
                graceMinutes: content.graceMinutes,
                assignedRole: content.assignedRole,
                checkerRole: content.checkerRole,
              },
            ],
            now
          );
          raised = instances.length;
        }
      );
      return { raised };
    }),

  /** Today's work: what this person can pick up, newest due first. */
  today: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(z.object({ penId: z.string().optional() }).default({}))
    .handler(async ({ context, input }) => {
      // Today means the farm's day: yesterday's unfinished work belongs on the Overdue
      // list, not on the phone's list of what to do now.
      const now = context.clock.now();
      const { from, to } = farmDayRange(now);
      const rows = await context.db.query.sopInstance.findMany({
        where: {
          farmId: context.farm.id,
          state: { in: [...OPEN_INSTANCE_STATES] },
          dueAt: { gte: from, lt: to },
          // Their Scope: their Pens, or one of them when they ask for it, and the work about their Cases.
          ...workInScopeWhere(context.scope, input.penId),
        },
        with: {
          version: { columns: { content: true, number: true } },
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
        },
        orderBy: { dueAt: "asc" },
      });
      // Late is a fact about the clock, not a state, so it is worked out on the way out
      // rather than waiting for something to have run.
      return rows.map((row) => ({ ...row, overdue: isOverdue(row, now) }));
    }),

  /** Everything the pen board needs: the Version's Steps, the Pen's animals, and what has
   *  already been recorded. */
  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const instance = await context.db.query.sopInstance.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        with: {
          version: true,
          // Which Version the Playbook is on now, so work running on an older one can say so
          // rather than leaving the person to wonder why the card on the wall differs.
          definition: { columns: { currentVersionId: true } },
          /** The report this work is about, so the Manager can reach the letter from the work
           *  rather than hunting for the Diagnosis that raised it. */
          report: { columns: { diagnosisId: true, reference: true } },
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
          completions: true,
        },
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND");
      }
      requireWorkInScope(context.scope, instance);
      const content = contentOf(instance.version);
      const animals = content.steps.some((step) => step.repeatPerAnimal)
        ? await animalsForInstance(
            context.db,
            context.farm.id,
            instance.penId,
            content,
            instance.animalId
          )
        : [];
      // The Session the Instance's effects wrote, so the reconciliation — and the flag the
      // Manager is meant to act on — is read where the work itself is read.
      const milkingSession = await context.db.query.milkingSession.findFirst({
        where: { farmId: context.farm.id, instanceId: instance.id },
        columns: {
          bulkLitres: true,
          sumBulkLitres: true,
          differenceLitres: true,
          tolerancePercent: true,
          flaggedAt: true,
        },
      });
      const now = context.clock.now();
      // What changed in the Version this work runs on, for somebody who has not yet done it
      // on that Version. No acknowledgement step: the marker is on the work until they have
      // done it once, which is when they have read it (notification channels, R1).
      const changed = await whatChangedFor(
        context.db,
        context.farm.id,
        context.actor.id,
        instance
      );
      // What this Pen is owed this session, for a Playbook entry that feeds. Worked out on
      // the Ration in force when the work was raised, so a Ration changed this afternoon does
      // not rewrite what the morning's round was asked for.
      const feeds = content.steps.some(
        (step) => step.effect?.kind === "feeding"
      );
      const feeding =
        feeds && instance.penId !== null
          ? await feedingTargetForPen(
              context.db,
              context.farm.id,
              instance.penId,
              instance.createdAt,
              sessionsPerDayOf(content)
            )
          : null;
      const fed = feeds
        ? await context.db.query.feeding.findFirst({
            where: { instanceId: instance.id },
            columns: {
              lines: true,
              shortfallPercent: true,
              flaggedAt: true,
              animals: true,
            },
          })
        : null;
      // What to count, for a Playbook entry that counts the store: every Feed Item the farm keeps,
      // and nothing about what the store is thought to hold — a count that can see the answer is a
      // count that copies it. What this work already counted comes back, so a Correction starts
      // from it.
      const counts = content.steps.some(
        (step) => step.effect?.kind === "stock_count"
      );
      const stockCount = counts
        ? {
            items: await context.db.query.feedItem.findMany({
              where: { farmId: context.farm.id, retiredAt: { isNull: true } },
              columns: { id: true, nameBn: true, nameEn: true, unit: true },
              orderBy: { nameBn: "asc", id: "asc" },
            }),
            counted: await context.db.query.stockCount.findMany({
              where: {
                farmId: context.farm.id,
                completionId: {
                  in: instance.completions.map((completion) => completion.id),
                },
              },
              columns: { feedItemId: true, counted: true, reason: true },
            }),
          }
        : null;
      const supersededBy =
        instance.definition.currentVersionId === instance.versionId
          ? null
          : instance.version.number;
      return {
        ...instance,
        // Each with what its Effect recorded beside the Evidence — the feed given, the store counted — which a Correction
        // says it was shown.
        completions: await Promise.all(
          instance.completions.map(async (completion) => ({
            ...completion,
            facts: factsAsShown(
              await recordedFactsOf(
                context.db as unknown as Tx,
                stepOf(content, completion.stepId),
                completion.id
              )
            ),
          }))
        ),
        content,
        changed,
        /** The Version this work runs on, when the Playbook has since moved on (ADR 0001). */
        runningOn: supersededBy,
        milkingSession: milkingSession ?? null,
        feeding,
        fed: fed ?? null,
        // What the Registration runs out on now, for the Step that renews it to a later day.
        renewal: content.steps.some(
          (step) => step.effect?.kind === "registration_renewal"
        )
          ? { expiresOn: context.farm.registrationExpiresOn }
          : null,
        stockCount: stockCount && {
          items: stockCount.items.map(({ id, ...item }) => ({
            feedItemId: id,
            ...item,
          })),
          counted: stockCount.counted.map((line) => ({
            ...line,
            counted: Number(line.counted),
          })),
        },
        // The gate the tile renders: the phone re-checks it offline from this, and the
        // server checks it again when the entry lands.
        animals: animals.map((beast) => ({
          ...beast,
          underMilkWithdrawal: underMilkWithdrawal(beast, now),
        })),
      };
    }),

  /** Claiming is exclusive: the first person to take it is the one working it. */
  claim: protectedProcedure
    .use(
      requireRole(...claimEntry.roles, { visitingVet: claimEntry.visitingVet })
    )
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await recordNow(context, claimEntry, { instanceId: input.id });
      return { id: input.id, claimed: true };
    }),

  /** The Manager pins an Instance to a person, or moves it to someone else. */
  assign: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string(), userId: z.string().nullable() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          before: (tx) => readWork(tx, input.id),
          after: (tx) => readWork(tx, input.id),
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            columns: { id: true, state: true, assignedRole: true },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          // Only work still owed: finished work is done, and work closed as Missed or Called Off is not to be done.
          requireMayTransition(instance, "assign");
          if (input.userId) {
            // Pinning to someone who cannot work it would strand the Instance: nobody else
            // may touch it, and they are not on this farm to pick it up.
            const target = await tx.query.user.findFirst({
              where: { id: input.userId },
              columns: { id: true },
              with: {
                roles: { where: { farmId: context.farm.id, ...ACTIVE_ROLE } },
              },
            });
            // Whoever it is pinned to must be able to work it — the Role the Instance is
            // for, or the Owner or Manager stepping in, exactly as assertMayWork allows.
            const held = target?.roles.map((role) => role.role) ?? [];
            const canWorkIt =
              held.includes(instance.assignedRole) ||
              held.includes("owner") ||
              held.includes("manager");
            if (!canWorkIt) {
              throw new ORPCError("BAD_REQUEST", {
                message: `That person cannot do ${instance.assignedRole} work on this farm`,
              });
            }
          }
          // Who changes, not where the work stands: work sent back stays sent back for whoever does it next.
          await requireTransition(tx, instance, "assign", {
            set: {
              assignedTo: input.userId,
              assignedBy: context.actor.id,
              // Reassigning takes it out of the previous person's hands.
              claimedBy: null,
              claimedAt: null,
            },
          });
        }
      );
      return { id: input.id, assignedTo: input.userId };
    }),

  /** Records one Step — once per animal where the Step repeats. The same answer again changes nothing; a different
   *  one is a Correction. */
  completeStep: protectedProcedure
    .use(
      requireRole(...stepCompletionEntry.roles, {
        visitingVet: stepCompletionEntry.visitingVet,
      })
    )
    .input(stepCompletionInput)
    .handler(async ({ context, input }) => {
      const { effect } = await recordNow(context, stepCompletionEntry, input);
      return { instanceId: input.instanceId, stepId: input.stepId, effect };
    }),

  /** A photograph a Step asked for, against the slot it answers — sent after the Step, as a phone's Outbox sends it. */
  attachPhoto: protectedProcedure
    .use(
      requireRole(...stepPhotoEntry.roles, {
        visitingVet: stepPhotoEntry.visitingVet,
      })
    )
    .input(stepPhotoInput)
    .handler(async ({ context, input }) => {
      await recordNow(context, stepPhotoEntry, input);
      return { completionId: input.completionId, slot: input.slot };
    }),

  /** Work that has gone late and is still open, whatever day it was due — the list the
   *  Manager works from, and the only way to reach work old enough to have left today's. */
  overdue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const late = await findLate(context.db, context.farm.id, now);
      // Their Scope: every late piece of work for those who run the farm, and for Barn Staff the work in their Pens and
      // the farm-wide work that is theirs to do.
      const mine = late.filter((row) => isWorkInScope(context.scope, row));
      return mine
        .map((row) => ({
          ...row,
          minutesOverdue: minutesOverdue(row, now),
          escalated: isEscalated(row, context.farm.escalationMinutes, now),
        }))
        .toSorted((a, b) => b.minutesOverdue - a.minutesOverdue);
    }),

  /** The checker's queue: work that has been done and is waiting on their Role. An SOP with
   *  no checker Role never appears here — that work is finished when it is completed. */
  signOffQueue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) =>
      workAwaitingSignOff(
        context.db,
        context.farm.id,
        context.roles,
        SIGN_OFF_LIMIT
      )
    ),

  /** The checker accepts the work. Terminal: an approved Instance is the farm's record. */
  approve: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          before: (tx) => readWork(tx, input.id),
          after: (tx) => readWork(tx, input.id),
        },
        async (tx) => {
          const instance = await loadCheckableInstance(tx, context, input.id);
          await requireTransition(tx, instance, "approve");
        }
      );
      return { id: input.id, state: "approved" } as const;
    }),

  /** The checker sends it back with a reason. It returns to the doer, who fixes or redoes
   *  it; the Completions stay, because recording a Step again corrects it. */
  sendBack: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string(), reason: reasonInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let raised: RaisedAlert[] = [];
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          before: (tx) => readWork(tx, input.id),
          after: (tx) => readWork(tx, input.id),
          reason: input.reason,
        },
        async (tx) => {
          const instance = await loadCheckableInstance(tx, context, input.id);
          await requireTransition(tx, instance, "sendBack", {
            set: { completedAt: null },
          });
          // The people who did the work are the people who have to hear about it — and a
          // Step can be recorded without anyone having claimed the Instance, so whoever
          // actually recorded something counts as having done it.
          const params = { ...alertParams(instance), reason: input.reason };
          const rows = await raiseAlerts(
            tx,
            context.farm.id,
            await doersOf(tx, context.farm.id, instance),
            {
              kind: "instance_sent_back",
              entity: "sop_instance",
              entityId: input.id,
              params,
            },
            now
          );
          raised = rows.map((row) => ({
            ...row,
            kind: "instance_sent_back",
            entity: "sop_instance",
            entityId: input.id,
            params,
          }));
        }
      );
      // The doer hears about it in their pocket, not only the next time they open the app:
      // work sent back is work somebody is waiting on (notification table, ticket 23). Sent
      // after the Instance is safely sent back, and never inside that transaction.
      await pushRaised(context, raised, now);
      return { id: input.id, state: "sent_back" } as const;
    }),

  /** Nothing disappears on its own: work that was never done stays open until someone says,
   *  with a reason, that it will not be. Only the people who run the farm may say it. */
  closeAsMissed: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string(), reason: reasonInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          before: (tx) => readWork(tx, input.id),
          after: (tx) => readWork(tx, input.id),
          reason: input.reason,
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            columns: { id: true, state: true, dueAt: true, graceMinutes: true },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          requireMayTransition(instance, "closeAsMissed");
          // Work that is not yet late has not been missed — it has not had its chance.
          if (!isOverdue(instance, now)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This work is not overdue yet",
            });
          }
          // No completedAt: nobody completed it. When it was closed, and by whom, is the
          // Audit Event's business.
          await requireTransition(tx, instance, "closeAsMissed");
        }
      );
      return { id: input.id, state: "missed" } as const;
    }),

  /**
   * Puts a recorded entry right. Unlike recording the Step again — which is what the person
   * doing the work does while they are still doing it — a Correction carries a reason, is
   * bounded by the Role's Correction Window, and supersedes the entry it replaces in the
   * trail rather than quietly overwriting it. The Completion still holds the current truth;
   * every version it has ever held is in its history.
   *
   * The Step's effects run again, keyed on the same Completion, so a corrected litres figure
   * replaces its Milk Record and the Session's reconciliation is worked out afresh.
   */
  correctStep: protectedProcedure
    .use(
      requireRole(...stepCorrection.roles, {
        visitingVet: stepCorrection.visitingVet,
      })
    )
    .input(stepCorrectionInput)
    .handler(async ({ context, input }) => {
      const { id, roleUsed, effect, needsReview } = await correct(
        context,
        stepCorrection,
        input
      );
      return { completionId: id, roleUsed, effect, needsReview };
    }),

  /** Finishes the Instance. Refused while any Step — or any animal within a per-animal
   *  Step — is neither done nor skipped. */
  complete: protectedProcedure
    .use(
      requireRole(...finishEntry.roles, {
        visitingVet: finishEntry.visitingVet,
      })
    )
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await recordNow(context, finishEntry, { instanceId: input.id });
      return { id: input.id, state: "completed" } as const;
    }),
};
