import { and, eq } from "@OpenFarm/db/operators";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import { sopInstance, stepCompletion } from "@OpenFarm/db/schema/instance";
import {
  AWAITING_SIGN_OFF,
  MILK_DESTINATIONS,
  PHOTO_MAX_BYTES,
  isEscalated,
  isOpen,
  isOverdue,
  mayCorrect,
  minutesOverdue,
  sessionsPerDayOf,
  underMilkWithdrawal,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { doersOf, raiseAlerts } from "../alerts-store";
import type { Tx } from "../audit";
import { audited } from "../audit";
import {
  applyClaim,
  applyComplete,
  applyCompletion,
  assertEvidenceComplete,
  stepOf,
} from "../completion-store";
import type { Recorded } from "../completion-store";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import type { EffectResult } from "../effects";
import { runStepEffect } from "../effects";
import { feedingTargetForPen } from "../feed-store";
import { protectedProcedure } from "../index";
import type { RaisedAlert } from "../instances-store";
import {
  alertParams,
  animalsForInstance,
  dueSlotsFor,
  happeningSlotsFor,
  farmDayRange,
  findLate,
  raiseDueInstances,
  recentHappenings,
  whatChangedFor,
} from "../instances-store";
import { pushRaised } from "../push-send";
import { raiseNeedsReview } from "../review-store";
import type { RoleName } from "../roles";
import { requireRole } from "../roles";
import { contentOf } from "../sop-content";

/** How much of the sign-off queue a screen is handed at once. */
const SIGN_OFF_LIMIT = 100;

const evidenceValue = z.union([z.boolean(), z.number(), z.string()]);

/** What one Feed Item was actually given, for a Step that feeds a Pen. */
const feedingLine = z.object({
  feedItemId: z.string(),
  givenKg: z.number().min(0),
  leftoverKg: z.number().min(0).optional(),
});

const completionInput = z.object({
  instanceId: z.string(),
  stepId: z.string().trim().min(1),
  animalTag: z.string().trim().optional(),
  /** One value per Evidence on the Step, in order. */
  evidence: z.array(evidenceValue).default([]),
  /** Where the milk went. Only for a Step whose effect writes a Milk Record; the server
   *  decides the final answer, because a cow under Withdrawal goes to Discard whatever the
   *  phone worked out from its last sync. */
  destination: z.enum(MILK_DESTINATIONS).optional(),
  /** What was actually put in front of the Pen, per Feed Item, for a Step that feeds. The
   *  Items come from the Pen's Ration rather than from the Version, so they travel beside
   *  the Evidence rather than as slots in it. */
  feeding: z.array(feedingLine).optional(),
  /** Set when the person was warned a number was outside its range and went ahead. */
  outOfRange: z.string().trim().max(120).optional(),
  skipReason: z.string().trim().max(120).optional(),
  /** One per Evidence slot that asked for a picture. A Step may ask for more than one — the
   *  udder and the tag, say — and a photo that could not say which it answered would be a
   *  photo nobody can read back. */
  photos: z
    .array(
      z.object({
        slot: z.number().int().min(0),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        data: z.string().min(1).max(PHOTO_MAX_BYTES),
      })
    )
    .max(8)
    .optional(),
  /** The phone's clock, for work captured offline. */
  recordedAt: z.coerce.date().optional(),
});

/** The Completion as the trail records it, so a Correction's before and after are the whole
 *  entry rather than the fields that happened to change. */
const readCompletion = async (tx: Tx, id: string) => {
  const row = await tx.query.stepCompletion.findFirst({
    where: { id },
    columns: {
      stepId: true,
      animalId: true,
      status: true,
      skipReason: true,
      evidence: true,
      outOfRange: true,
      destination: true,
    },
  });
  return row ? { ...row } : null;
};

/** The state an Instance was in, for a trail that cannot be argued with. */
const readInstanceState = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.sopInstance.findFirst({
    where: { id, farmId },
    columns: { state: true, completedAt: true },
  });
  return row
    ? { ...row, completedAt: row.completedAt?.toISOString() ?? null }
    : null;
};

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
  if (instance.state !== AWAITING_SIGN_OFF) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This work is ${instance.state}, not waiting for sign-off`,
    });
  }
  if (!instance.checkerRole) {
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

/** Staff see only their assigned Pens; everyone else sees the Pen they asked for, or all. */
const penFilter = (
  assigned: string[] | null,
  requested: string | undefined
) => {
  if (!assigned) {
    return requested ? { penId: requested } : {};
  }
  const visible = requested
    ? assigned.filter((id) => id === requested)
    : assigned;
  return { penId: { in: visible } };
};

export const instancesRouter = {
  /**
   * Raises the Instances the farm's day needs. Idempotent, so the phone and the office can
   * both call it on open; a scheduled job replaces that later.
   */
  ensureDue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
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
      const slots = [
        ...dueSlotsFor(now, sops, animals),
        // Work the clock does not raise: a Move, an arrival, a cow reaching a State. Same
        // pass, because whatever opened the app wants the whole day's work, not the half
        // of it a schedule accounts for.
        ...happeningSlotsFor(
          now,
          sops,
          await recentHappenings(context.db, context.farm.id, now)
        ),
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
        async (tx) => {
          const instances = await raiseDueInstances(
            tx,
            context.farm.id,
            slots,
            now
          );
          raised = instances.length;
        }
      );
      return { raised };
    }),

  /** Today's work: what this person can pick up, newest due first. */
  today: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ penId: z.string().optional() }).default({}))
    .handler(async ({ context, input }) => {
      const scoped = context.roleUsed === "staff";
      if (scoped && context.penIds.length === 0) {
        return [];
      }
      // Today means the farm's day: yesterday's unfinished work belongs on the Overdue
      // list, not on the phone's list of what to do now.
      const now = context.clock.now();
      const { from, to } = farmDayRange(now);
      const rows = await context.db.query.sopInstance.findMany({
        where: {
          farmId: context.farm.id,
          state: { in: ["due", "in_progress", "sent_back"] },
          dueAt: { gte: from, lt: to },
          // Both filters must hold: a Staff member asking for one Pen gets that Pen only
          // if it is theirs, rather than silently getting all of theirs.
          ...penFilter(scoped ? context.penIds : null, input.penId),
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
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const instance = await context.db.query.sopInstance.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        with: {
          version: true,
          // Which Version the Playbook is on now, so work running on an older one can say so
          // rather than leaving the person to wonder why the card on the wall differs.
          definition: { columns: { currentVersionId: true } },
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
      const feeding = feeds
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
      const supersededBy =
        instance.definition.currentVersionId === instance.versionId
          ? null
          : instance.version.number;
      return {
        ...instance,
        content,
        changed,
        /** The Version this work runs on, when the Playbook has since moved on (ADR 0001). */
        runningOn: supersededBy,
        milkingSession: milkingSession ?? null,
        feeding,
        fed: fed ?? null,
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
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          after: { claimedBy: context.actor.id },
        },
        (tx) => applyClaim(tx, context, input.id, now)
      );
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
          after: { assignedTo: input.userId },
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            columns: { state: true, assignedRole: true },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          if (instance.state === "completed" || instance.state === "approved") {
            throw new ORPCError("BAD_REQUEST", {
              message: "Finished work cannot be reassigned",
            });
          }
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
          await tx
            .update(sopInstance)
            .set({
              assignedTo: input.userId,
              assignedBy: context.actor.id,
              // Reassigning takes it out of the previous person's hands.
              claimedBy: null,
              claimedAt: null,
              state: "due",
            })
            .where(
              and(
                eq(sopInstance.id, input.id),
                eq(sopInstance.farmId, context.farm.id)
              )
            );
        }
      );
      return { id: input.id, assignedTo: input.userId };
    }),

  /** Records one Step — once per animal where the Step repeats. Recording again corrects it. */
  completeStep: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(completionInput)
    .handler(async ({ context, input }) => {
      const receivedAt = context.clock.now();
      // Held aside as well as returned, because the Audit Event's snapshots are read after
      // `apply` has run and cannot see what it returned.
      let recorded: Recorded | null = null;
      const applied = await audited(context).write(
        {
          // The Completion is its own thing in the trail, so a Correction has something
          // precise to supersede and an entry's history reads back on its own.
          entity: "step_completion",
          entityId: () => recorded?.completionId ?? "",
          action: "update",
          // Read after the write, so the trail records what the effect actually decided —
          // a Destination forced to Discard reads as Discard, not as what was asked for.
          after: () =>
            Promise.resolve({
              instanceId: input.instanceId,
              stepId: input.stepId,
              animalTag: input.animalTag ?? null,
              effect: recorded?.effect ?? null,
            }),
        },
        async (tx) => {
          recorded = await applyCompletion(tx, context, input, receivedAt);
          return recorded;
        }
      );
      return {
        instanceId: input.instanceId,
        stepId: input.stepId,
        effect: applied.effect,
      };
    }),

  /** Work that has gone late and is still open, whatever day it was due — the list the
   *  Manager works from, and the only way to reach work old enough to have left today's. */
  overdue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const scoped = context.roleUsed === "staff";
      if (scoped && context.penIds.length === 0) {
        return [];
      }
      const now = context.clock.now();
      const late = await findLate(context.db, context.farm.id, now);
      const mine = scoped
        ? late.filter((row) => context.penIds.includes(row.penId))
        : late;
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
      context.db.query.sopInstance.findMany({
        where: {
          farmId: context.farm.id,
          state: AWAITING_SIGN_OFF,
          checkerRole: { in: context.roles },
        },
        with: {
          version: { columns: { content: true, number: true } },
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
        },
        orderBy: { completedAt: "asc" },
        limit: SIGN_OFF_LIMIT,
      })
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
          before: { state: AWAITING_SIGN_OFF },
          after: { state: "approved" },
        },
        async (tx) => {
          await loadCheckableInstance(tx, context, input.id);
          await tx
            .update(sopInstance)
            .set({ state: "approved" })
            .where(eq(sopInstance.id, input.id));
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
          before: { state: AWAITING_SIGN_OFF },
          after: { state: "sent_back" },
          reason: input.reason,
        },
        async (tx) => {
          const instance = await loadCheckableInstance(tx, context, input.id);
          await tx
            .update(sopInstance)
            .set({ state: "sent_back", completedAt: null })
            .where(eq(sopInstance.id, input.id));
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
          before: (tx) => readInstanceState(tx, context.farm.id, input.id),
          after: { state: "missed" },
          reason: input.reason,
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            columns: { state: true, dueAt: true, graceMinutes: true },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          if (!isOpen(instance.state)) {
            throw new ORPCError("BAD_REQUEST", {
              message: `This work is ${instance.state}; only work still open can be closed as missed`,
            });
          }
          // Work that is not yet late has not been missed — it has not had its chance.
          if (!isOverdue(instance, now)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This work is not overdue yet",
            });
          }
          // No completedAt: nobody completed it. When it was closed, and by whom, is the
          // Audit Event's business.
          await tx
            .update(sopInstance)
            .set({ state: "missed" })
            .where(eq(sopInstance.id, input.id));
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
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({
        completionId: z.string(),
        evidence: z.array(evidenceValue).default([]),
        destination: z.enum(MILK_DESTINATIONS).optional(),
        feeding: z.array(feedingLine).optional(),
        outOfRange: z.string().trim().max(120).optional(),
        skipReason: z.string().trim().max(120).optional(),
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.stepCompletion.findFirst({
        where: { id: input.completionId, farmId: context.farm.id },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND");
      }
      const verdict = mayCorrect({
        roles: context.roles,
        isOwnEntry: existing.recordedBy === context.actor.id,
        // The farm's clock, not the phone's: a Correction Window measured on a device's own
        // time would be a window the device could widen.
        recordedAt: existing.receivedAt,
        now,
        windows: correctionWindows(context.farm),
      });
      if (!verdict.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: "The correction window for that entry has closed",
          data: { refusal: refusalData(verdict.refusal) },
        });
      }
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "step_completion",
        existing.id
      );
      const photos = await context.db.query.completionPhoto.findMany({
        where: { completionId: existing.id },
        columns: { slot: true },
      });
      let effect: EffectResult = null;
      let flagged = false;
      await audit.write(
        {
          entity: "step_completion",
          entityId: existing.id,
          action: "correct",
          reason: input.reason,
          // Not simply the highest Role they hold: the one whose Correction Window let this
          // through is the one answerable for it.
          roleUsed: verdict.role,
          // The entry this one replaces, so the trail reads as a chain rather than as a
          // pile of edits.
          supersedesId: previous?.id,
          before: (tx) => readCompletion(tx, existing.id),
          after: (tx) => readCompletion(tx, existing.id),
        },
        async (tx, eventId) => {
          // Loaded with its Pen, because a Needs Review raised below has to say which work
          // it is about.
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: existing.instanceId, farmId: context.farm.id },
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
          const content = contentOf(instance.version);
          const step = stepOf(content, existing.stepId);
          const skipping = Boolean(input.skipReason);
          assertEvidenceComplete(step, input.evidence, skipping, (slot) =>
            photos.some((row) => row.slot === slot)
          );
          await tx
            .update(stepCompletion)
            .set({
              status: skipping ? "skipped" : "done",
              skipReason: input.skipReason ?? null,
              evidence: input.evidence,
              outOfRange: input.outOfRange ?? null,
              destination: input.destination ?? null,
            })
            .where(eq(stepCompletion.id, existing.id));
          // Keyed on the same Completion, so the record it wrote is replaced rather than
          // added to, and the Session's reconciliation is worked out afresh.
          effect = await runStepEffect(tx, {
            step,
            instance: {
              id: instance.id,
              farmId: context.farm.id,
              penId: instance.penId,
              dueAt: instance.dueAt,
              raisedAt: instance.createdAt,
            },
            completionId: existing.id,
            animalId: existing.animalId,
            evidence: input.evidence,
            destination: input.destination,
            feeding: input.feeding ?? [],
            feedTolerancePercent: context.farm.feedTolerancePercent,
            sessionsPerDay: sessionsPerDayOf(content),
            skipped: skipping,
            tolerancePercent: context.farm.milkTolerancePercent,
            recordedBy: existing.recordedBy,
            recordedAt: existing.recordedAt,
            now,
          });
          // She has been walked on since, so putting her back where this entry now says
          // would overwrite something the farm knows and this Correction does not. She
          // stays where she was last seen and a person is asked which is true.
          if (effect?.kind === "move" && effect.cannotUndo) {
            flagged = true;
            await raiseNeedsReview(
              tx,
              context.farm.id,
              {
                entity: "step_completion",
                entityId: existing.id,
                reason: "irreversible_effect",
                auditEventId: eventId,
                params: {
                  ...alertParams(instance),
                  stepId: existing.stepId,
                  toPenId: effect.toPenId,
                },
              },
              now
            );
          }
          // A checker has already signed this work off, on the figures as they were. The
          // system cannot unsign it, so it says so and the Manager decides — in the same
          // transaction as the Correction, because a Correction whose flag went missing is
          // worse than no Correction at all.
          if (instance.state === "approved") {
            flagged = true;
            await raiseNeedsReview(
              tx,
              context.farm.id,
              {
                entity: "step_completion",
                entityId: existing.id,
                reason: "corrected_after_sign_off",
                auditEventId: eventId,
                params: {
                  ...alertParams(instance),
                  stepId: existing.stepId,
                },
              },
              now
            );
          }
        }
      );
      // Typed explicitly: both are assigned inside the transaction callback, which the
      // compiler cannot see, so they would otherwise be inferred as their initial values.
      const outcome: {
        completionId: string;
        roleUsed: RoleName;
        effect: EffectResult;
        needsReview: boolean;
      } = {
        completionId: existing.id,
        roleUsed: verdict.role,
        effect,
        needsReview: flagged,
      };
      return outcome;
    }),

  /** Finishes the Instance. Refused while any Step — or any animal within a per-animal
   *  Step — is neither done nor skipped. */
  complete: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      // Read first: work already finished needs no second telling, and an Audit Event for a
      // transition that did not happen is a trail that lies.
      const already = await context.db.query.sopInstance.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { state: true },
      });
      if (already?.state === "completed" || already?.state === "approved") {
        return { id: input.id, state: "completed" } as const;
      }
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          before: { state: "in_progress" },
          after: { state: "completed" },
        },
        (tx) => applyComplete(tx, context, input.id, now)
      );
      return { id: input.id, state: "completed" } as const;
    }),
};
