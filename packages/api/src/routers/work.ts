import type { Database } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import type { SopContent } from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  campaignProductOf,
  awaitsSignOff,
  isEscalated,
  isOverdue,
  mayRaiseByHand,
  maySignOff,
  minutesOverdue,
  sessionsPerDayOf,
  underMilkWithdrawal,
  farmDayOf,
  tagNumberAsWritten,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { openCalvingRecord } from "../calving-record-store";
import { campaignsOpen, notDueOnTheWalk } from "../campaign-interval-store";
import { stepOf } from "../completion-store";
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
  workAwaitingSignOffCount,
  alertParams,
  animalsForInstance,
  farmDayRange,
  findLate,
  raiseDueInstances,
  whatChangedFor,
} from "../instances-store";
import { lastFiguresOfWork } from "../last-figures";
import { licenseOfCause } from "../license-store";
import { tell } from "../notice";
import { pushRaised } from "../push-send";
import { raiseThePutOff } from "../put-off-store";
import { requireRole } from "../roles";
import {
  isWorkInScope,
  requireAnimalInScope,
  requireWorkInScope,
  workInScopeWhere,
} from "../scope";
import { contentOf } from "../sop-content";
import { asTheFarm, theDaysWork } from "../the-day-turns";
import { ABOUT_HER, aboutHer } from "../work-about";
import { putOffOf, unwellThatRaised } from "../work-cause";
import {
  readWork,
  requireMayTransition,
  requireTransition,
} from "../work-transitions";

/** How much of the sign-off queue a screen is handed at once. */
const SIGN_OFF_LIMIT = 100;

/** The most of a day's done work listed on the phone: the latest of it, with how much there was in all beside. */
const DONE_LISTED = 50;

/** The most Pens one piece of work is raised in at once: more than a farm of five hundred head has. */
const MAX_PENS_RAISED = 100;

/**
 * Loads the Instance a checker may sign off, refusing if they may not: it must be waiting
 * for sign-off, and waiting on a Role they hold. Holding some other Role is not enough — the
 * Version named who checks this work. The Owner may always step in, the same license they
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
      data: { refusal: "not_checked_by_anyone" },
    });
  }
  const mayCheck =
    context.roles.includes(instance.checkerRole) ||
    context.roles.includes("owner");
  if (!mayCheck) {
    throw new ORPCError("FORBIDDEN", {
      message: `This work is signed off by ${instance.checkerRole}`,
      data: { refusal: "not_yours_to_sign_off" },
    });
  }
  // Marking your own work as checked is not a check — except for the Owner. The rule is the domain's, and the
  // sign-off queue asks it too before it offers the buttons.
  if (!maySignOff(instance, { id: context.actor.id, roles: context.roles })) {
    throw new ORPCError("FORBIDDEN", {
      message: "Work is signed off by someone other than the person who did it",
      data: { refusal: "own_work_not_signed_off" },
    });
  }
  return instance;
};

/**
 * What a Playbook entry's work is handed to count, where it counts: every Feed Item the farm keeps, or every product on
 * its Drug List — and what this work counted of them before, so a Correction starts from it. Nothing of what the farm
 * thinks it holds: a count that can see the answer copies it.
 */
const countBoardsOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  content: SopContent,
  completionIds: string[]
) => {
  // What to count, for a Playbook entry that counts the store: every Feed Item the farm keeps,
  // and nothing about what the store is thought to hold — a count that can see the answer is a
  // count that copies it. What this work already counted comes back, so a Correction starts
  // from it.
  const counts = content.steps.some(
    (step) => step.effect?.kind === "stock_count"
  );
  const stockCount = counts
    ? {
        items: await db.query.feedItem.findMany({
          where: { farmId, retiredAt: { isNull: true } },
          columns: { id: true, nameBn: true, nameEn: true, unit: true },
          orderBy: { nameBn: "asc", id: "asc" },
        }),
        counted: await db.query.stockCount.findMany({
          where: {
            farmId,
            completionId: { in: completionIds },
          },
          columns: { feedItemId: true, counted: true, reason: true },
        }),
      }
    : null;
  // What to count, for a Playbook entry that counts the medicine: every product on the Drug List, in doses, and
  // nothing about what the store is thought to hold — a blind count, as the feed's is.
  const countsMedicine = content.steps.some(
    (step) => step.effect?.kind === "medicine_count"
  );
  const medicineCount = countsMedicine
    ? {
        items: await db.query.drugProduct.findMany({
          where: { farmId, retiredAt: { isNull: true } },
          columns: { id: true, nameBn: true, nameEn: true },
          orderBy: { nameBn: "asc", id: "asc" },
        }),
        counted: await db.query.medicineCount.findMany({
          where: {
            farmId,
            completionId: { in: completionIds },
          },
          columns: { drugProductId: true, counted: true, reason: true },
        }),
      }
    : null;
  return { stockCount, medicineCount };
};

/** A refused Correction or photo knows its Completion even after the phone's cached work expires. Resolve only
 * within this farm; the board's normal role and work scope checks still apply below. */
const resolveWorkId = async (
  db: Database,
  farmId: string,
  input: { id: string } | { completionId: string }
): Promise<string> => {
  if ("id" in input) {
    return input.id;
  }
  const completion = await db.query.stepCompletion.findFirst({
    where: { id: input.completionId, farmId },
    columns: { instanceId: true },
  });
  if (!completion) {
    throw new ORPCError("NOT_FOUND");
  }
  return completion.instanceId;
};

/**
 * What a renewal's closing Step is shown of the paper it renews: when it runs out now — the Registration's, or the
 * License's the work was raised for — and which License that is. Nothing for work that renews nothing.
 */
const renewalShown = async (
  context: {
    db: Pick<Database, "query">;
    farm: { id: string; registrationExpiresOn: Date | null };
  },
  content: SopContent,
  cause: string | null
) => {
  const renews = (kind: "registration_renewal" | "license_renewal") =>
    content.steps.some((step) => step.effect?.kind === kind);
  if (renews("registration_renewal")) {
    return { expiresOn: context.farm.registrationExpiresOn, license: null };
  }
  if (!renews("license_renewal")) {
    return null;
  }
  const licenseId = licenseOfCause(cause);
  const license = licenseId
    ? await context.db.query.farmLicense.findFirst({
        where: { id: licenseId, farmId: context.farm.id },
        columns: { kind: true, name: true, number: true, expiresOn: true },
      })
    : undefined;
  return license
    ? {
        expiresOn: license.expiresOn,
        license: {
          kind: license.kind,
          name: license.name,
          number: license.number,
        },
      }
    : { expiresOn: null, license: null };
};

export const workRouter = {
  /**
   * Raises the Instances the farm's day needs. Idempotent, so the phone and the office can
   * both call it on open; a scheduled job replaces that later.
   */
  ensureDue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) => theDaysWork(asTheFarm(context))),

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
    .input(
      z
        .object({
          definitionId: z.string(),
          penId: z.string().optional(),
          /** Several Pens at once — a Campaign over a whole shed or Side — one piece of work in each. */
          penIds: z.array(z.string()).min(1).max(MAX_PENS_RAISED).optional(),
        })
        .refine((given) => given.penId !== undefined || given.penIds, {
          message: "Choose a Pen",
        })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const penIds = [
        ...new Set([
          ...(input.penId === undefined ? [] : [input.penId]),
          ...(input.penIds ?? []),
        ]),
      ];
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
      if (!mayRaiseByHand(content)) {
        const prescribed = content.triggers.some(
          (trigger) => trigger.kind === "prescription"
        );
        throw new ORPCError("BAD_REQUEST", {
          message: prescribed
            ? "A prescription raises this work, one dose at a time"
            : "Its own record raises this work: a diagnosis, or the registration",
          data: {
            refusal: prescribed
              ? "prescription_raises_it"
              : "its_record_raises_it",
          },
        });
      }
      let raised = 0;
      let openAlready = 0;
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: `${input.definitionId}:${now.toISOString()}`,
          action: "create",
          after: { definitionId: input.definitionId, penIds },
        },
        async (tx) => {
          // Inside the transaction, like every other read a write depends on: a Pen deleted
          // between the check and the insert would leave work standing in nowhere.
          for (const penId of penIds) {
            // oxlint-disable-next-line no-await-in-loop -- one Pen at a time, on the one transaction
            await requirePen(tx, context.farm.id, penId);
          }
          // A Campaign already standing open in a Pen — raised by hand or by the turn — is walked there, not raised a
          // second time beside it.
          const open =
            campaignProductOf(content) === null
              ? new Set<string>()
              : await campaignsOpen(tx, context.farm.id, [definition.id]);
          const notOpen = penIds.filter(
            (penId) => !open.has(`${definition.id}:${penId}`)
          );
          openAlready = penIds.length - notOpen.length;
          // Work about the whole farm is in no Pen, raised by hand as by the clock: once, whichever Pens were chosen.
          const raisedIn =
            content.wholeFarm === true ? notOpen.slice(0, 1) : notOpen;
          const instances = await raiseDueInstances(
            tx,
            context.farm.id,
            raisedIn.map((penId) => ({
              definitionId: definition.id,
              versionId: definition.currentVersion?.id ?? "",
              penId: content.wholeFarm === true ? null : penId,
              dueAt: now,
              // Named for who asked and when, so asking twice by accident raises one piece
              // of work rather than two.
              cause: `byHand:${penId}:${farmDayOf(now)}`,
              graceMinutes: content.graceMinutes,
              assignedRole: content.assignedRole,
              checkerRole: content.checkerRole,
            })),
            now
          );
          raised = instances.length;
        }
      );
      return { raised, openAlready };
    }),

  /**
   * Opens the farm's Calving record about one cow now, in her Pen: the milker on the night round finds her calving with
   * no round open, and records it there rather than waking the Manager to raise it. Hers to open who may record about
   * her — her Pen's Barn Staff, and those who run the farm.
   */
  openCalvingRecord: protectedProcedure
    .use(requireRole("owner", "manager", "staff"))
    .input(z.object({ tagNumber: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const her = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: tagNumberAsWritten(input.tagNumber),
        },
        columns: {
          id: true,
          sex: true,
          side: true,
          state: true,
          penId: true,
          lactationNumber: true,
        },
      });
      if (!her) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      requireAnimalInScope(context.scope, her);
      const now = context.clock.now();
      let opened = { id: "" };
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: `calved:${her.id}:${now.toISOString()}`,
          action: "create",
          after: { animalId: her.id, penId: her.penId },
        },
        async (tx) => {
          opened = await openCalvingRecord(tx, context.farm.id, her, now);
        }
      );
      return opened;
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
          ...ABOUT_HER,
        },
        orderBy: { dueAt: "asc" },
      });
      // Work raised again after it was put off says so, and the day the work it follows was due.
      const originals = [
        ...new Set(rows.flatMap((row) => putOffOf(row.cause)?.original ?? [])),
      ];
      const first =
        originals.length === 0
          ? []
          : await context.db.query.sopInstance.findMany({
              where: { farmId: context.farm.id, cause: { in: originals } },
              columns: { cause: true, dueAt: true },
            });
      const firstDue = new Map(first.map((one) => [one.cause, one.dueAt]));
      // Late is a fact about the clock, not a state, so it is worked out on the way out
      // rather than waiting for something to have run.
      return rows.map((row) => {
        const again = putOffOf(row.cause);
        return {
          ...row,
          ...aboutHer(row),
          overdue: isOverdue(row, now),
          /** Raised again after it was put off: which time, and when the work it follows was first due. */
          putOff: again
            ? { n: again.n, firstDueAt: firstDue.get(again.original) ?? null }
            : null,
        };
      });
    }),

  /** What was finished today in this person's Scope, last done first: the other half of the day's list, so a list with
   *  nothing left on it reads as a morning done rather than work gone missing. Named and placed, nothing more — the
   *  work itself is opened from its page — and only the latest of a long day listed, with how much there was in all.
   *  Says which farm day it answers for, so a phone holding the answer overnight never shows yesterday's as today's. */
  doneToday: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const { from, to } = farmDayRange(now);
      const finishedToday = {
        farmId: context.farm.id,
        state: { in: ["completed" as const, "approved" as const] },
        completedAt: { gte: from, lt: to },
        ...workInScopeWhere(context.scope),
      };
      const [rows, all] = await Promise.all([
        context.db.query.sopInstance.findMany({
          where: finishedToday,
          columns: { id: true, penId: true, completedAt: true },
          with: {
            // Its name alone: the Version's Steps and evidence are no part of a line saying it was done.
            version: {
              columns: {},
              extras: { name: (version) => sql`${version.content} -> 'name'` },
            },
            pen: {
              columns: { name: true },
              with: { shed: { columns: { name: true } } },
            },
          },
          orderBy: { completedAt: "desc", id: "desc" },
          limit: DONE_LISTED,
        }),
        context.db.query.sopInstance.findMany({
          where: finishedToday,
          columns: { id: true },
        }),
      ]);
      return {
        day: farmDayOf(now),
        count: all.length,
        done: rows.map((row) => ({
          id: row.id,
          name: row.version.name as SopContent["name"],
          penId: row.penId,
          pen: row.pen,
          completedAt: row.completedAt,
        })),
      };
    }),

  /** How much waits for this person's Sign-off, counted: the Manager's bar carries it on every page, where the queue
   *  itself would be far too much to ask for there. */
  signOffWaiting: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => ({
      waiting: await workAwaitingSignOffCount(
        context.db,
        context.farm.id,
        context.roles
      ),
    })),

  /** Everything the pen board needs: the Version's Steps, the Pen's animals, and what has
   *  already been recorded. */
  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(
      z.union([
        z.object({ id: z.string() }),
        z.object({ completionId: z.string().trim().min(1) }),
      ])
    )
    .handler(async ({ context, input }) => {
      const workId = await resolveWorkId(context.db, context.farm.id, input);
      const instance = await context.db.query.sopInstance.findFirst({
        where: { id: workId, farmId: context.farm.id },
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
          ...ABOUT_HER,
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
      // What each animal gave or weighed the time before, where the Step done at each reads a figure against it.
      const lasts = await lastFiguresOfWork(
        context.db,
        context.farm.id,
        { ...instance, content },
        animals.map((beast) => beast.id)
      );
      // On a Campaign that comes round, those its last dose still covers: passed as not due, not dosed again.
      const covered = await notDueOnTheWalk(
        context.db,
        context.farm.id,
        content,
        animals.map((beast) => beast.id),
        context.clock.now()
      );
      // The Session the Instance's effects wrote, so the reconciliation — and the flag the
      // Manager is meant to act on — is read where the work itself is read.
      const milkingSession = await context.db.query.milkingSession.findFirst({
        where: { farmId: context.farm.id, instanceId: instance.id },
        columns: {
          bulkLiters: true,
          sumBulkLiters: true,
          differenceLiters: true,
          tolerancePercent: true,
          flaggedAt: true,
        },
      });
      const now = context.clock.now();
      // What changed in the Version this work runs on, for somebody who has not yet done it
      // on that Version. No acknowledgment step: the marker is on the work until they have
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
              herdWeightKg: true,
            },
          })
        : null;
      const { stockCount, medicineCount } = await countBoardsOf(
        context.db,
        context.farm.id,
        content,
        instance.completions.map((completion) => completion.id)
      );
      // What the round saw, for the Manager's work on an unwell animal: the job is to answer it, so it says what it is.
      const unwellId = unwellThatRaised(instance.cause);
      const seen = unwellId
        ? await context.db.query.observation.findFirst({
            where: { id: unwellId, farmId: context.farm.id },
            columns: { sawLabel: true, seenAt: true, note: true },
            with: {
              observer: { columns: { name: true } },
              animal: { columns: { tagNumber: true } },
            },
          })
        : undefined;
      const supersededBy =
        instance.definition.currentVersionId === instance.versionId
          ? null
          : instance.version.number;
      // Who holds it — whoever claimed it, else whoever it was pinned to — by name, so somebody else opening it is
      // told whose it is rather than offered a Claim the farm would refuse.
      const holderId = instance.claimedBy ?? instance.assignedTo;
      const holder = holderId
        ? await context.db.query.user.findFirst({
            where: { id: holderId },
            columns: { id: true, name: true },
          })
        : undefined;
      return {
        ...instance,
        ...aboutHer(instance),
        heldBy: holder ?? null,
        /** What the round saw, when this is the Manager's work on it. */
        seen: seen
          ? {
              tag: seen.animal.tagNumber,
              label: seen.sawLabel,
              seenAt: seen.seenAt,
              note: seen.note,
              seenByName: seen.observer?.name ?? null,
            }
          : null,
        // Each with what its Effect recorded beside the Evidence — the feed given, the store counted — which a Correction
        // says it was shown.
        completions: await Promise.all(
          instance.completions.map(async (completion) => ({
            ...completion,
            facts: factsAsShown(
              await recordedFactsOf(
                context.db,
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
        // The Pen's weight as its lines by weight were worked out from, turned from the numeric column at the edge.
        fed: fed
          ? {
              ...fed,
              herdWeightKg:
                fed.herdWeightKg === null ? null : Number(fed.herdWeightKg),
            }
          : null,
        // What the Registration — or the License the work was raised for — runs out on now, for the Step that renews it
        // to a later day, and which License that is.
        renewal: await renewalShown(context, content, instance.cause),
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
        medicineCount: medicineCount && {
          items: medicineCount.items.map(({ id, ...item }) => ({
            drugProductId: id,
            ...item,
          })),
          counted: medicineCount.counted,
        },
        // The gate the tile renders: the phone re-checks it offline from this, and the
        // server checks it again when the entry lands.
        animals: animals.map((beast) => ({
          ...beast,
          underMilkWithdrawal: underMilkWithdrawal(beast, now),
          /** What she gave or weighed the time before; nothing where the Step reads no figure, or she has none. */
          last: lasts.get(beast.id) ?? null,
          /** The day her last dose of a Campaign that comes round was given, where it still covers her; nothing
           *  otherwise. */
          notDueSince: covered.get(beast.id) ?? null,
          /** She is Ready for Sale: a dose given one animal at a time is held for her sale, not given. */
          readyForSale: beast.state === "ready_for_sale",
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
              columns: { id: true, disabledAt: true },
              with: {
                roles: { where: { farmId: context.farm.id, ...ACTIVE_ROLE } },
              },
            });
            // Nobody who has left: work pinned to them is work nobody else may touch, and they are not here to do it.
            if (target?.disabledAt) {
              throw new ORPCError("BAD_REQUEST", {
                message: "That person no longer works on this farm",
                data: { refusal: "has_left_the_farm" },
              });
            }
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
                data: { refusal: "cannot_do_that_work" },
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
          // Its procedure by name, which is all the list shows: every Step of every late piece of work, a year on, was
          // megabytes to a phone.
          version: {
            content: { name: (row.version.content as SopContent).name },
          },
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
          raised = await tell(
            tx,
            context.farm.id,
            {
              kind: "instance_sent_back",
              about: { id: input.id, work: instance },
              facts: { ...alertParams(instance), reason: input.reason },
            },
            now
          );
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
              data: { refusal: "not_overdue_yet" },
            });
          }
          // No completedAt: nobody completed it. When it was closed, and by whom, is the
          // Audit Event's business.
          await requireTransition(tx, instance, "closeAsMissed");
          // A Release nobody walked is still owed while he is in Quarantine: raised again after the farm's days.
          await raiseThePutOff(tx, context.farm.id, instance.id, now, now, {
            trail: audited(context).recordEvent,
          });
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
   * The Step's effects run again, keyed on the same Completion, so a corrected liters figure
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
