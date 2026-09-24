import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { isQuiet } from "@OpenFarm/domain";

import { audited } from "./audit";
import type { Tx } from "./audit";
import { pregnancyTimesOf } from "./breeding-store";
import type { Context } from "./context";
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
} from "./instances-store";
import { papersToTell, tellAboutPapersDue } from "./investor-statement-notice";
import {
  raiseStoreNotices,
  storeNoticesUntold,
  whatTheStoreHasToSay,
} from "./lot-notices";
import { tell } from "./notice";
import { carryThePost, pushRaised } from "./push-send";
import { tellOfRenewals } from "./registration-store";
import { textTheSafetyAlerts } from "./sms-send";
import { contentOf } from "./sop-content";
import { lowStockToTell, raiseLowStockAlerts, runningLow } from "./stock-store";
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
export const theDaysWork = async (context: Turning) => {
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
      // A procedure's first Version catches up with the animals already on their way; a later one does not raise
      // again what the first raised.
      catchesUp: definition.currentVersion?.number === 1,
    }));
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
  const onTheSchedule = dueSlotsFor(now, sops, animals);
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
  const forTheRenewal = renewalSlotsFor(now, sops, {
    expiresOn: context.farm.registrationExpiresOn,
    renewalLeadDays: context.farm.registrationRenewalLeadDays,
  });
  const slots = [...onTheSchedule, ...byWhatHappened, ...forTheRenewal];
  if (slots.length === 0) {
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
        entityId: `schedule:${now.toISOString().slice(0, 10)}`,
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
  const low = await runningLow(context.db, context.farm.id);
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

/** The Instance the sweep's Audit Event is keyed on: the first it has something to say
 *  about, with the rest named in the event's payload. */
const first = (pending: {
  overdue: { id: string }[];
  escalated: { id: string }[];
}): string => pending.overdue[0]?.id ?? pending.escalated[0]?.id ?? "";

export const theSweep = async (context: Turning) => {
  const now = context.clock.now();
  // Three things that have nothing to do with each other: work that went late, cows coming off a
  // Withdrawal, and feed running low. The other two are told about first, because late work
  // having nothing to say is the steady state and must not silence them.
  await tellAboutWithdrawals(context, now);
  await tellAboutLowStock(context, now);
  await tellAboutTheStore(context, now);
  await tellAboutPapers(context, now);
  const pending = await findPendingNotices(context.db, context.farm, now);
  // A sweep with nothing to say is not an event, and opens no transaction: everyone
  // calls this on opening the app, and in steady state there is nothing new to say.
  // The watermark stays where it is — a window with nothing in it costs nothing to
  // look at again.
  if (pending.overdue.length + pending.escalated.length === 0) {
    return { overdue: 0, escalated: 0 };
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
  return { overdue: swept.overdue, escalated: swept.escalated };
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
      console.error(`the day turning: ${piece}`, error);
      return null;
    }
  };
  const visitsEnded = await turn("visits ending", () =>
    endExpiredVisits(context)
  );
  const work = await turn("the day's work", () => theDaysWork(context));
  const swept = await turn("the sweep", () => theSweep(context));
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
