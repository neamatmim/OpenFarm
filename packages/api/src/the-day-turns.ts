import {
  GUESSES_BEFORE_SLOWING,
  GUESSES_KEPT_MS,
  GUESS_WINDOW_MS,
} from "@OpenFarm/auth/guesses";
import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import {
  atFarmTime,
  farmDaysApart,
  farmDayOf,
  isQuiet,
} from "@OpenFarm/domain";

import { audited } from "./audit";
import type { Tx } from "./audit";
import { pregnancyTimesOf } from "./breeding-store";
import type { Context } from "./context";
import { milkAccountOn, tellOfUnaccountedMilk } from "./dispatch-store";
import { dosesToTell, tellOfDoses } from "./dose-not-prescribed-store";
import { stillHereAfterEid } from "./eid-store";
import { countsToTell, tellOfCounts } from "./head-count-store";
import {
  anyUntold,
  raiseWithdrawalAlerts,
  withdrawalsEndingSoon,
} from "./health-store";
import {
  dueSlotsFor,
  findPendingNotices,
  happeningSlotsFor,
  minuteOfFarmDay,
  postDueAt,
  raiseDueInstances,
  raiseLateAlerts,
  recentHappenings,
  renewalSlotsFor,
  TRIGGER_LOOKBACK_DAYS,
  triggerKey,
} from "./instances-store";
import { papersToTell, tellAboutPapersDue } from "./investor-statement-notice";
import {
  raiseStoreNotices,
  storeNoticesUntold,
  whatTheStoreHasToSay,
} from "./lot-notices";
import { missingToTell, tellOfMissing } from "./missing-store";
import { missedToTell, raiseMissedSums } from "./monthly-sums-store";
import { tell } from "./notice";
import { carryThePost, carryWhatWasHeld, pushRaised } from "./push-send";
import { overdueToTell, raiseOverdueReceivable } from "./receivable-store";
import { openRenewalsOf, tellOfRenewals } from "./registration-store";
import {
  reimbursementsToTell,
  tellAboutReimbursementsDue,
} from "./reimbursement-store";
import { settleWhatIsSettled } from "./settled-notices";
import { textAgainWhatDidNotGo, textTheSafetyAlerts } from "./sms-send";
import { contentOf } from "./sop-content";
import { soresToTell, tellOfSores } from "./sores-store";
import { lowStockToTell, raiseLowStockAlerts, runningLow } from "./stock-store";
import { asLogged } from "./thrown";
import { endExpiredVisits } from "./visits-store";
import { heatThatRaised } from "./work-cause";

const MINUTE_MS = 60_000;

// Everything the farm does because time has passed rather than because somebody did something (the glossary's Day
// Turning): work falling due, a visit running out, the sweep of what has gone late, and the evening's post. Here
// rather than in the routers that used to hold it, because the server's own timer runs the same round — and a
// timer reaching up into a router to find the farm's work is the wrong way round.

/** The farm, and whoever is asking on its behalf: the server's timer with no person behind it, or somebody opening
 *  the app. Every piece of the turning needs both, and the push and the text need the transports on it. */
export type Turning = Context & { farm: NonNullable<Context["farm"]> };

/**
 * The turning as the farm's own act, whoever's opening of the app set it off: the work it raises, the late work it
 * calls out, the post it carries are the farm's, and the trail files them as the server's own timer does — under no
 * person, on no phone — not as a milker's for having opened the app at six.
 */
export const asTheFarm = (context: Turning): Turning => ({
  ...context,
  session: null,
  device: null,
  actor: null,
  person: null,
  roles: [],
  rolesOffThePhone: [],
  penIds: [],
  visiting: false,
  caseAnimalIds: [],
  roleUsed: null,
  scope: { kind: "nothing" },
});

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
      // Named by her tag, so the notice says whose heat came late.
      const her = slot.animalId
        ? // oxlint-disable-next-line no-await-in-loop -- one cow at a time, as the notices are
          await tx.query.animal.findFirst({
            where: { id: slot.animalId },
            columns: { tagNumber: true },
          })
        : undefined;
      const herTag = her?.tagNumber ?? null;
      // Sequential: one Needs Review each, in the order the work was raised.
      // oxlint-disable-next-line no-await-in-loop
      await tell(
        tx,
        farmId,
        {
          kind: "needs_review",
          about: {
            id: work.id,
            entity: "sop_instance",
            auditEventId: eventId,
          },
          facts: {
            reason: "late_entry",
            why: "heat_after_window",
            closedAt: slot.dueAt,
            tag: herTag,
          },
        },
        now
      );
    }
  }
};

/** A turn of the day that raised no work: rolled back, so it leaves nothing in the trail. */
class NothingRaisedError extends Error {
  constructor() {
    super("The day's work was already raised");
    this.name = "NothingRaisedError";
  }
}

/** The causes a set of slots would raise work under. */
const causesOf = (slots: { cause?: string | null }[]) =>
  new Set(slots.flatMap((slot) => (slot.cause ? [slot.cause] : [])));

/** How much of what was raised came from each place: work the clock raised has no cause of its own, or the whole
 *  farm's; work raised by a happening or by the renewal carries that slot's cause. */
const raisedBy = (
  instances: { cause: string | null }[],
  byWhatHappened: { cause?: string | null }[],
  forTheRenewal: { cause?: string | null }[]
) => {
  const happened = causesOf(byWhatHappened);
  const renewal = causesOf(forTheRenewal);
  const counted = { byTheSchedule: 0, byWhatHappened: 0, forTheRenewal: 0 };
  for (const work of instances) {
    if (work.cause && happened.has(work.cause)) {
      counted.byWhatHappened += 1;
    } else if (work.cause && renewal.has(work.cause)) {
      counted.forTheRenewal += 1;
    } else {
      counted.byTheSchedule += 1;
    }
  }
  return counted;
};

/** The day's work, raised: every schedule slot due by now, and the work things that happened call for. Idempotent — a
 *  slot already raised is not raised again — so the server's own timer and whoever opens the app can both run it. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a turn catches up the days the server was down for: a week of milkings is as much backlog as anybody
 *  answers; a server down longer than that is a farm that knows it was. */
const CATCH_UP_DAYS = 7;

/** The farm days after the last one whose work was raised and before today: those nobody turned, at most a week of
 *  them, the latest. None on the first turn ever, which has nothing to catch up. */
const daysMissedSince = (raisedOn: string | null, today: string): string[] => {
  if (raisedOn === null) {
    return [];
  }
  const gone = Math.min(farmDaysApart(raisedOn, today) - 1, CATCH_UP_DAYS);
  return Array.from({ length: Math.max(0, gone) }, (_, back) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - (gone - back) * DAY_MS)
      .toISOString()
      .slice(0, "YYYY-MM-DD".length)
  );
};

/** Remembers the day's scheduled work as raised — once a day, outside the trail: it is the timer's own bookkeeping, as
 *  the sweep's watermark is. */
const rememberTheDayRaised = async (context: Turning, today: string) => {
  if (context.farm.workRaisedOn === today) {
    return;
  }
  await context.db
    .update(farm)
    .set({ workRaisedOn: today })
    .where(eq(farm.id, context.farm.id));
};

/** How many of a procedure's Versions are looked back over for how long a trigger has been in force. */
const VERSIONS_LOOKED_BACK = 12;

/**
 * For each trigger of a procedure's newest Version, when it first came into force without a break: the publishing of
 * the oldest Version in the unbroken run, newest first, that carries the same trigger.
 */
const inForceSinceByTrigger = (
  versions: readonly { number: number; content: unknown; publishedAt: Date }[]
): Map<string, Date> => {
  const since = new Map<string, Date>();
  const [newest, ...before] = versions;
  if (!newest) {
    return since;
  }
  for (const trigger of contentOf(newest).triggers) {
    const key = triggerKey(trigger);
    let from = newest.publishedAt;
    for (const older of before) {
      if (!contentOf(older).triggers.some((one) => triggerKey(one) === key)) {
        break;
      }
      from = older.publishedAt;
    }
    since.set(key, from);
  }
  return since;
};

export const theDaysWork = async (context: Turning) => {
  const now = context.clock.now();
  const definitions = await context.db.query.sopDefinition.findMany({
    where: { farmId: context.farm.id, retiredAt: { isNull: true } },
    with: {
      currentVersion: true,
      // The Versions before it, newest first: how long each trigger has been in force without a break.
      versions: {
        columns: { number: true, content: true, publishedAt: true },
        orderBy: { number: "desc" },
        limit: VERSIONS_LOOKED_BACK,
      },
    },
  });
  const sops = definitions
    .filter((definition) => definition.currentVersion)
    .map((definition) => {
      const published =
        definition.currentVersion?.publishedAt ?? definition.createdAt;
      // Brought back from being retired after it was published, it is in force again from then: nothing that happened
      // while it was retired is owed, nor caught up with.
      const { restoredAt } = definition;
      const restored = restoredAt !== null && restoredAt > published;
      return {
        definitionId: definition.id,
        versionId: definition.currentVersion?.id ?? "",
        content: contentOf({ content: definition.currentVersion?.content }),
        triggersInForceSince: restored && restoredAt ? restoredAt : published,
        // A trigger the Versions before it carried too has been in force since the first of them: a Move recorded on a
        // phone before a change to the procedure's words, and sent after it, still raises its check.
        triggerInForceSince: restored
          ? undefined
          : inForceSinceByTrigger(definition.versions),
        // A procedure's first Version catches up with the animals already on their way; a later one does not raise
        // again what the first raised.
        catchesUp: !restored && definition.currentVersion?.number === 1,
      };
    });
  // As far back as the longest a procedure hangs work after an arrival or a State, so the one it catches up with
  // is found.
  const reachDays =
    TRIGGER_LOOKBACK_DAYS +
    Math.max(
      0,
      ...sops.flatMap((sop) =>
        sop.content.triggers.map((trigger) =>
          trigger.kind === "event" || trigger.kind === "state"
            ? (trigger.offsetDays ?? 0)
            : 0
        )
      )
    );
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
  // Today's scheduled work, and that of any day the server was down for since the last one raised: a day nobody turned
  // still had its milkings, and they are raised now, already late, for the Manager to answer (the Owner, 2026-10-06).
  const today = farmDayOf(now);
  const missedDays = daysMissedSince(context.farm.workRaisedOn, today);
  const inForceSince = new Map(
    sops.map((sop) => [sop.definitionId, sop.triggersInForceSince])
  );
  const onTheSchedule = [
    ...missedDays.flatMap((day) =>
      dueSlotsFor(atFarmTime(day, "12:00"), sops, animals).filter(
        // Never work owed before its procedure was in force.
        (slot) => slot.dueAt >= (inForceSince.get(slot.definitionId) ?? now)
      )
    ),
    ...dueSlotsFor(now, sops, animals),
  ];
  // Work the clock does not raise: a Move, an arrival, a cow reaching a State. Same pass, because whatever opened
  // the app wants the whole day's work, not the half of it a schedule accounts for.
  const byWhatHappened = happeningSlotsFor(
    now,
    sops,
    await recentHappenings(
      context.db,
      context.farm.id,
      now,
      breeding,
      reachDays
    ),
    breeding
  );
  // Work about the whole farm: its Registration coming up for renewal.
  const forTheRenewal = renewalSlotsFor(
    now,
    sops,
    {
      expiresOn: context.farm.registrationExpiresOn,
      renewalLeadDays: context.farm.registrationRenewalLeadDays,
    },
    await openRenewalsOf(context.db, context.farm.id)
  );
  const slots = [...onTheSchedule, ...byWhatHappened, ...forTheRenewal];
  if (slots.length === 0) {
    await rememberTheDayRaised(context, today);
    return { raised: 0 };
  }
  let raised = { byTheSchedule: 0, byWhatHappened: 0, forTheRenewal: 0 };
  // What the trail says of it: how much work was raised, and by what — the Playbook's schedule, something that
  // happened to an animal, or the Registration coming up for renewal. Only when something was: the farm turns its
  // day every time anybody opens the app, and a turn that raised nothing is no event.
  await audited(context)
    .write(
      {
        entity: "sop_instance",
        // The farm's day, not UTC's: the first turn after midnight in Savar is still yesterday in UTC.
        entityId: `schedule:${today}`,
        action: "create",
        after: () =>
          Promise.resolve({
            raised:
              raised.byTheSchedule +
              raised.byWhatHappened +
              raised.forTheRenewal,
            ...raised,
          }),
      },
      async (tx, eventId) => {
        const instances = await raiseDueInstances(
          tx,
          context.farm.id,
          slots,
          now
        );
        if (instances.length === 0) {
          throw new NothingRaisedError();
        }
        raised = raisedBy(instances, byWhatHappened, forTheRenewal);
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
    )
    .catch((error: unknown) => {
      if (!(error instanceof NothingRaisedError)) {
        throw error;
      }
    });
  await rememberTheDayRaised(context, today);
  return {
    raised: raised.byTheSchedule + raised.byWhatHappened + raised.forTheRenewal,
  };
};

/**
 * The other half of the sweep: cows coming off a Withdrawal within the day. Its own audited
 * write, keyed on an animal rather than on an Instance, because no work raised it — the clock
 * did, against a date a Treatment set.
 */
const tellAboutWithdrawals = async (context: Turning, now: Date) => {
  const ending = await withdrawalsEndingSoon(context.db, context.farm.id, now);
  const [soonest] = ending;
  // Nothing coming off, or everyone has already been told: no transaction, no trail entry.
  if (!soonest || !(await anyUntold(context.db, context.farm.id, ending))) {
    return;
  }
  const raised = await audited(context).write(
    {
      entity: "animal",
      entityId: soonest.id,
      action: "update",
      after: () =>
        Promise.resolve({ endingSoon: ending.map((beast) => beast.tagNumber) }),
    },
    (tx) => raiseWithdrawalAlerts(tx, context.farm.id, ending, now)
  );
  await pushRaised(context, raised, now);
  // And by text, for the two the farm cannot afford to miss. After the push and outside the
  // transaction, for the same reason: a gateway is somebody else's server.
  await textTheSafetyAlerts(context, raised);
};

/**
 * The other part of the sweep with nothing to do with late work: Feed Items running low. Keyed on the
 * first Feed Item it tells about, with the rest named in the event, because the store — not any work —
 * is what the notice is about.
 */
const tellAboutLowStock = async (context: Turning, now: Date) => {
  const low = await runningLow(context.db, context.farm, now);
  const toTell = await lowStockToTell(context.db, context.farm.id, low);
  const [lowest] = toTell.untold;
  if (!lowest) {
    return;
  }
  await audited(context).write(
    {
      entity: "feed_item",
      entityId: lowest.feedItemId,
      action: "update",
      after: () =>
        Promise.resolve({
          toldRunningLow: toTell.untold.map((line) => line.feedItemId),
        }),
    },
    (tx) => raiseLowStockAlerts(tx, context.farm.id, toTell, now)
  );
};

/**
 * The week's milk nobody can account for, past the Owner's line: told to the Owner and the Manager in the evening's post,
 * once a farm day. Nothing written on a day already told, or a week that balances.
 */
const tellAboutUnaccountedMilk = async (context: Turning, now: Date) => {
  const today = farmDayOf(now);
  const told = await context.db.query.alert.findFirst({
    where: {
      farmId: context.farm.id,
      kind: "milk_unaccounted",
      entityId: today,
    },
    columns: { id: true },
  });
  if (told) {
    return;
  }
  const account = await milkAccountOn(context.db, context.farm.id, now);
  if (
    account.notAccounted <= 0 ||
    account.notAccountedPercent <= context.farm.milkUnaccountedPercent
  ) {
    return;
  }
  await audited(context).write(
    {
      entity: "farm_day",
      entityId: today,
      action: "update",
      after: () =>
        Promise.resolve({
          toldMilkUnaccounted: account.notAccounted,
          percent: account.notAccountedPercent,
        }),
    },
    (tx) => tellOfUnaccountedMilk(tx, context.farm, now)
  );
};

/**
 * Animals aimed at an Eid still on the Farm once its Qurbani is over: told to the Owner and the Manager in the evening's
 * post, once for that Eid — the next market is theirs to choose. Nothing before Qurbani is over, or with none left.
 */
const tellAboutEidLeftovers = async (context: Turning, now: Date) => {
  const left = await stillHereAfterEid(
    context.db,
    context.farm.id,
    farmDayOf(now)
  );
  if (!left) {
    return;
  }
  const told = await context.db.query.alert.findFirst({
    where: {
      farmId: context.farm.id,
      kind: "still_here_after_eid",
      entityId: left.expectedDay,
    },
    columns: { id: true },
  });
  if (told) {
    return;
  }
  await audited(context).write(
    {
      entity: "eid",
      entityId: left.expectedDay,
      action: "update",
      after: () =>
        Promise.resolve({
          toldStillHere: left.own + left.inVentures,
        }),
    },
    (tx) =>
      tell(
        tx,
        context.farm.id,
        {
          kind: "still_here_after_eid",
          about: { id: left.expectedDay },
          facts: {
            day: left.day,
            animals: left.own + left.inVentures,
            inVentures: left.inVentures,
          },
        },
        now
      )
  );
};

/**
 * Several animals in one Pen seen with sores on the mouth or feet: told once to the Owner and the Manager, and pushed at
 * once — FMD spreads through a Pen in days. Keyed on the first Pen told about, with the rest named in the event.
 */
const tellAboutSores = async (context: Turning, now: Date) => {
  const untold = await soresToTell(context.db, context.farm, now);
  const [firstOne] = untold;
  if (!firstOne) {
    return;
  }
  const raised = await audited(context).write(
    {
      entity: "pen",
      entityId: firstOne.key,
      action: "update",
      after: () =>
        Promise.resolve({ toldSores: untold.map((pen) => pen.penName) }),
    },
    (tx) => tellOfSores(tx, context.farm.id, untold, now)
  );
  await pushRaised(context, raised, now);
};

/**
 * Pens that did not count right at lock-up: each told once to the Manager, and pushed at once — the Pen is walked
 * tonight, while an animal gone is still near. Keyed on the first Pen's evening work, with the rest named in the event.
 */
const tellAboutHeadCounts = async (context: Turning, now: Date) => {
  const untold = await countsToTell(context.db, context.farm.id, now);
  const [firstOne] = untold;
  if (!firstOne) {
    return;
  }
  const raised = await audited(context).write(
    {
      entity: "sop_instance",
      entityId: firstOne.instanceId,
      action: "update",
      after: () =>
        Promise.resolve({ toldCounts: untold.map((one) => one.penName) }),
    },
    (tx) => tellOfCounts(tx, context.farm.id, untold, now)
  );
  await pushRaised(context, raised, now);
};

/**
 * Doses given without a Prescription: each told once to the Vet, and pushed at once — the Vet answers for every
 * withdrawal day, and a hold that is wrong is milk in the tank. Keyed on the first dose, with the rest named in the event.
 */
const tellAboutDosesNotPrescribed = async (context: Turning, now: Date) => {
  const untold = await dosesToTell(context.db, context.farm.id, now);
  const [firstOne] = untold;
  if (!firstOne) {
    return;
  }
  const raised = await audited(context).write(
    {
      entity: "treatment",
      entityId: firstOne.id,
      action: "update",
      after: () =>
        Promise.resolve({ toldDoses: untold.map((one) => one.tagNumber) }),
    },
    (tx) => tellOfDoses(tx, context.farm.id, untold, now)
  );
  await pushRaised(context, raised, now);
};

/**
 * Animals the round could not find: each told once to the Owner and the Manager, and pushed at once — an animal gone
 * in the night may be on a lorry to a livestock market by noon. Keyed on the first one told about, with the rest named in the event.
 */
const tellAboutMissing = async (context: Turning, now: Date) => {
  const untold = await missingToTell(context.db, context.farm.id);
  const [firstOne] = untold;
  if (!firstOne) {
    return;
  }
  const raised = await audited(context).write(
    {
      entity: "missing",
      entityId: firstOne.id,
      action: "update",
      after: () =>
        Promise.resolve({ toldMissing: untold.map((one) => one.tag) }),
    },
    (tx) => tellOfMissing(tx, context.farm.id, untold, now)
  );
  await pushRaised(context, raised, now);
};

/**
 * Receivable gone past its day: each Sale or Dispatch told once to the Owner and the Manager, in the evening's post, the day
 * it first goes late. Keyed on the first one it tells about, with the rest named in the event, as the store's notices
 * are — the money owed, not any work, is what these are about.
 */
const tellAboutOverdueReceivable = async (context: Turning, now: Date) => {
  const untold = await overdueToTell(context.db, context.farm, farmDayOf(now));
  const [firstOne] = untold;
  if (!firstOne) {
    return;
  }
  await audited(context).write(
    {
      entity: "receivable",
      entityId: firstOne.item.id,
      action: "update",
      after: () =>
        Promise.resolve({ toldOverdue: untold.map((one) => one.item.id) }),
    },
    (tx) => raiseOverdueReceivable(tx, context.farm.id, untold, now)
  );
};

/**
 * Where a run of guessing began: walking back from the newest wrong password, as long as each is within the hour of
 * the next. Guessing that goes on keeps its first guess, so the run is told once; an hour's quiet ends it.
 */
export const runStartOf = (at: readonly Date[]): Date | undefined => {
  let start = at.at(-1);
  for (let index = at.length - 2; index >= 0; index -= 1) {
    const earlier = at[index];
    if (
      !(earlier && start) ||
      start.getTime() - earlier.getTime() > GUESS_WINDOW_MS
    ) {
      break;
    }
    start = earlier;
  }
  return start;
};

/**
 * Tells the Owner of each sign-in address somebody has guessed at — five wrong passwords within the hour — once for
 * each run of guessing, named by where the run began: a notice named by the hour's first guess moved every few minutes
 * while somebody kept at it, and a night of it came out as dozens at five in the morning. The account is already slowed
 * by the sign-in itself; this is the Owner hearing of it.
 */
const tellAboutPasswordGuesses = async (context: Turning, now: Date) => {
  const rows = await context.db.query.passwordGuess.findMany({
    where: { guessedAt: { gt: new Date(now.getTime() - GUESSES_KEPT_MS) } },
    columns: { login: true, guessedAt: true },
    orderBy: { guessedAt: "asc", id: "asc" },
  });
  const byLogin = new Map<string, Date[]>();
  for (const row of rows) {
    byLogin.set(row.login, [...(byLogin.get(row.login) ?? []), row.guessedAt]);
  }
  const hourAgo = now.getTime() - GUESS_WINDOW_MS;
  const guessed = [...byLogin].flatMap(([login, at]) => {
    const inTheHour = at.filter((one) => one.getTime() > hourAgo);
    const since = runStartOf(at);
    return inTheHour.length >= GUESSES_BEFORE_SLOWING && since
      ? [
          {
            login,
            guesses: inTheHour.length,
            since,
            id: `guess:${login}:${since.toISOString()}`,
          },
        ]
      : [];
  });
  if (guessed.length === 0) {
    return;
  }
  const told = await context.db.query.alert.findMany({
    where: {
      farmId: context.farm.id,
      kind: "password_guessed",
      entityId: { in: guessed.map((one) => one.id) },
    },
    columns: { entityId: true },
  });
  const untold = guessed.filter(
    (one) => !told.some((row) => row.entityId === one.id)
  );
  const [first] = untold;
  if (!first) {
    return;
  }
  const people = await context.db.query.user.findMany({
    where: { email: { in: untold.map((one) => one.login) } },
    columns: { email: true, name: true },
  });
  await audited(context).write(
    {
      entity: "password_guess",
      entityId: first.id,
      action: "update",
      after: () =>
        Promise.resolve({ toldGuessing: untold.map((one) => one.login) }),
    },
    async (tx) => {
      for (const one of untold) {
        // oxlint-disable-next-line no-await-in-loop -- one transaction, one client
        await tell(
          tx,
          context.farm.id,
          {
            kind: "password_guessed",
            about: { id: one.id },
            facts: {
              login: one.login,
              name:
                people.find((person) => person.email === one.login)?.name ??
                null,
              guesses: one.guesses,
              since: one.since.toISOString(),
            },
          },
          now
        );
      }
    }
  );
};

/**
 * Monthly Sums missed: each Agreement's latest missed month told once to the Owner, in the evening's post. Keyed on the
 * first Agreement it tells about, with the rest named in the event, as the overdue Receivable is — the money owed, not any
 * work, is what these are about.
 */
const tellAboutMissedSums = async (context: Turning, now: Date) => {
  const untold = await missedToTell(
    context.db,
    context.farm.id,
    farmDayOf(now)
  );
  const [firstOne] = untold;
  if (!firstOne) {
    return;
  }
  await audited(context).write(
    {
      entity: "investment_agreement",
      entityId: firstOne.aboutId.split("|")[0] ?? "",
      action: "update",
      after: () =>
        Promise.resolve({ toldMissedSums: untold.map((one) => one.aboutId) }),
    },
    (tx) => raiseMissedSums(tx, context.farm.id, untold, now)
  );
};

/**
 * What else the store has to say: a Lot of medicine or feed near its last day or past it with some still left, and
 * medicine running under its level. Keyed on the first thing it tells about, with the rest named in the event, as
 * the feed running low is — the store, not any work, is what these are about.
 */
const tellAboutTheStore = async (context: Turning, now: Date) => {
  const said = await whatTheStoreHasToSay(context.db, context.farm, now);
  const untold = await storeNoticesUntold(context.db, context.farm.id, said);
  const [first] = untold;
  if (!first) {
    return;
  }
  await audited(context).write(
    {
      entity: "store",
      entityId: first.id,
      action: "update",
      after: () =>
        Promise.resolve({
          told: untold.map((one) => ({ kind: one.kind, about: one.id })),
        }),
    },
    (tx) => raiseStoreNotices(tx, context.farm.id, untold, now)
  );
};

/**
 * Tells the Owner which Ventures owe their Investors a progress statement: the month, and the day a
 * **Wind-up Period** begins. The other two occasions are raised by the acts that cause them.
 *
 * Silent when there is nothing to say, which is the steady state — everyone calls this on opening the
 * app, and a farm with no Venture running must not open a transaction for it.
 */
const tellAboutPapers = async (context: Turning, now: Date) => {
  const due = await papersToTell(
    context.db,
    context.farm.id,
    now,
    context.farm.windUpDays
  );
  const [first] = due;
  // Nothing anybody has yet to hear: no transaction, no trail entry. Everyone calls this on opening
  // the app, and a farm whose Ventures have all been told about this month has nothing to say.
  if (!first) {
    return;
  }
  let raised = 0;
  await audited(context).write(
    {
      // Keyed on the first Venture it has something to say about, with the count in the payload — as
      // the low-stock sweep keys itself on the first Feed Item.
      entity: "venture",
      entityId: first.venture.id,
      action: "update",
      // Read after the raising: what the trail records is how many tellings this turn actually wrote.
      after: () => Promise.resolve({ investorStatementsDue: raised }),
    },
    async (tx) => {
      raised = await tellAboutPapersDue(tx, context.farm.id, due, now);
    }
  );
};

/**
 * Telling the Owner which running Ventures owe the Farm the month just over, from the first of the month. Asked before
 * any transaction, as the paper sweep is: once the month's tellings are made, a turn of the day writes nothing.
 */
const tellAboutReimbursements = async (context: Turning, now: Date) => {
  const due = await reimbursementsToTell(context.db, context.farm.id, now);
  const [first] = due;
  if (!first) {
    return;
  }
  let raised = 0;
  await audited(context).write(
    {
      // Keyed on the first Venture it has something to say about, with the count in the payload.
      entity: "venture",
      entityId: first.venture.id,
      action: "update",
      after: () => Promise.resolve({ reimbursementsDue: raised }),
    },
    async (tx) => {
      raised = await tellAboutReimbursementsDue(tx, context.farm.id, due, now);
    }
  );
};

/** The Instance the sweep's Audit Event is keyed on: the first it has something to say
 *  about, with the rest named in the event's payload. */
const first = (pending: {
  overdue: { id: string }[];
  escalated: { id: string }[];
  missed: { firstId: string } | null;
}): string =>
  pending.overdue[0]?.id ??
  pending.escalated[0]?.id ??
  pending.missed?.firstId ??
  "";

export const theSweep = async (context: Turning) => {
  const now = context.clock.now();
  // Three things that have nothing to do with each other: work that went late, cows coming off a
  // Withdrawal, and feed running low. The other two are told about first, because late work
  // having nothing to say is the steady state and must not silence them. Each told on its own: one that cannot be read
  // is logged and named, and never silences those behind it — late milkings above all.
  const couldNotTell: string[] = [];
  const tellings: [string, () => Promise<unknown>][] = [
    // First, what has been put right since: a notice whose cause is gone clears, before anything new is said.
    ["settled", () => settleWhatIsSettled(context)],
    ["withdrawals", () => tellAboutWithdrawals(context, now)],
    ["missing", () => tellAboutMissing(context, now)],
    ["head counts", () => tellAboutHeadCounts(context, now)],
    ["doses not prescribed", () => tellAboutDosesNotPrescribed(context, now)],
    ["sores", () => tellAboutSores(context, now)],
    ["milk unaccounted", () => tellAboutUnaccountedMilk(context, now)],
    ["Eid leftovers", () => tellAboutEidLeftovers(context, now)],
    ["low stock", () => tellAboutLowStock(context, now)],
    ["the store", () => tellAboutTheStore(context, now)],
    ["overdue Receivables", () => tellAboutOverdueReceivable(context, now)],
    ["missed sums", () => tellAboutMissedSums(context, now)],
    ["password guesses", () => tellAboutPasswordGuesses(context, now)],
    ["papers", () => tellAboutPapers(context, now)],
    ["Reimbursements", () => tellAboutReimbursements(context, now)],
    // And the safety texts that did not go when their notice was raised, tried again until they do.
    ["texts", () => textAgainWhatDidNotGo(context)],
    // And the pushes the quiet hours held, or nothing carried, once the farm is awake.
    ["held pushes", () => carryWhatWasHeld(context, now)],
  ];
  for (const [what, telling] of tellings) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one at a time, on one client, as they always were
      await telling();
    } catch (error) {
      couldNotTell.push(what);
      // oxlint-disable-next-line no-console
      console.error(`the sweep: ${what}`, asLogged(error));
    }
  }
  const pending = await findPendingNotices(context.db, context.farm, now);
  // A sweep with nothing to say is not an event, and opens no transaction: everyone
  // calls this on opening the app, and in steady state there is nothing new to say.
  // The watermark stays where it is — a window with nothing in it costs nothing to
  // look at again.
  if (
    pending.overdue.length + pending.escalated.length === 0 &&
    !pending.missed
  ) {
    return { overdue: 0, escalated: 0, couldNotTell };
  }
  // Audited against each Instance the notice is about, not against the sweep: an
  // entityId no row carries is a trail entry nothing can find its way back to. Reading
  // an Instance's history now shows that it went late and who was told.
  const swept = await audited(context).write(
    {
      entity: "sop_instance",
      entityId: first(pending),
      action: "update",
      after: () =>
        Promise.resolve({
          overdue: pending.overdue.map((row) => row.id),
          escalated: pending.escalated.map((row) => row.id),
          ...(pending.missed ? { missed: pending.missed.count } : {}),
        }),
    },
    async (tx) => {
      const raised = await raiseLateAlerts(tx, context.farm.id, pending, now);
      // Remembered inside the same transaction as the notices: a watermark that moved
      // on without them would step over work nobody was ever told about.
      await tx
        .update(farm)
        .set({ alertsSweptFrom: pending.sweptFrom })
        .where(eq(farm.id, context.farm.id));
      return raised;
    }
  );
  // The tap on the shoulder goes out after the Alerts are safely the farm's record, and
  // never inside the transaction that made them: a push is a call to somebody else's
  // server, and a hung one would hold a lock every phone in the shed is waiting on.
  await pushRaised(context, swept.raised, now);
  return { overdue: swept.overdue, escalated: swept.escalated, couldNotTell };
};

export const theDigest = async (context: Turning) => {
  const nothing = { people: 0, told: { sent: 0, gone: 0, missed: 0 } };
  const now = context.clock.now();
  const quiet = {
    from: context.farm.quietFrom,
    until: context.farm.quietUntil,
  };
  // Not only "has a carrying moment passed" but "is the farm awake": somebody opening
  // the app at half past midnight must not set every phone on the farm buzzing.
  if (isQuiet(minuteOfFarmDay(now), quiet)) {
    return nothing;
  }
  const upTo = postDueAt(now, context.farm.digestTimes, quiet);
  if (!upTo) {
    return nothing;
  }
  return await carryThePost(context, now, upTo);
};

/** The pieces a day's turning is made of, in the order they run. */
export type Piece =
  | "visits ending"
  | "the day's work"
  | "the sweep"
  | "the digest";

/**
 * One turn of the farm's day: the visits that have run out ended, the day's work raised, what has gone late swept, and
 * the evening's post carried — in that order, because each reads what the one before it wrote.
 *
 * Every piece is taken on its own. A gateway that is down, or a post that fails, is not a reason for the day's work to
 * go unraised; what went wrong comes back with the tally rather than stopping the turn. Idempotent throughout, so the
 * server's timer and whoever opens the app may both run it, as often as they like.
 */
export const theDayTurns = async (
  context: Turning
): Promise<{
  visitsEnded: number;
  workRaised: number;
  overdue: number;
  escalated: number;
  toldTheDigest: number;
  /** The pieces that did not turn, named. Empty for a day that turned whole. */
  wentWrong: Piece[];
}> => {
  const wentWrong: Piece[] = [];
  /** Each piece on its own: what it did, or nothing and its name on the list of what did not turn. */
  const turn = async <Did>(
    piece: Piece,
    doing: () => Promise<Did>
  ): Promise<Did | null> => {
    try {
      return await doing();
    } catch (error) {
      wentWrong.push(piece);
      // What actually went wrong is for whoever reads a log; the Owner's page is told which piece it was.
      // oxlint-disable-next-line no-console
      console.error(`the day turning: ${piece}`, asLogged(error));
      return null;
    }
  };
  const visitsEnded = await turn("visits ending", () =>
    endExpiredVisits(context)
  );
  const work = await turn("the day's work", () => theDaysWork(context));
  const swept = await turn("the sweep", () => theSweep(context));
  // The sweep told what it could; one telling it could not is still the sweep gone wrong, and the Owner hears so.
  if (swept && swept.couldNotTell.length > 0) {
    wentWrong.push("the sweep");
  }
  const digest = await turn("the digest", () => theDigest(context));
  return {
    visitsEnded: visitsEnded ?? 0,
    workRaised: work?.raised ?? 0,
    overdue: swept?.overdue ?? 0,
    escalated: swept?.escalated ?? 0,
    toldTheDigest: digest?.people ?? 0,
    wentWrong,
  };
};
