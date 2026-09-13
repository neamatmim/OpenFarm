import { eq, inArray } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { CalvingLead } from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  attemptOf,
  attemptsThatBegin,
  calvingWorkDue,
  expectedCalvingFrom,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import {
  ATTEMPT_KEY_PREFIX,
  attemptKeyOf,
  calvingCauseParts,
  calvingKeyOf,
  calvingWorkPrefix,
} from "./instances-store";

/** The Farm Parameters a pregnancy is timed by: how long a cow carries, and how long before her
 *  Expected Calving each piece of calving work falls. */
export interface PregnancyTimes {
  gestationDays: number;
  calvingLeadDays: Record<CalvingLead, number>;
}

/** The farm's pregnancy times, as its Parameters hold them. */
export const pregnancyTimesOf = (farm: {
  gestationDays: number;
  dryOffLeadDays: number;
  calvingPrepLeadDays: number;
}): PregnancyTimes => ({
  gestationDays: farm.gestationDays,
  calvingLeadDays: {
    dry_off: farm.dryOffLeadDays,
    calving_prep: farm.calvingPrepLeadDays,
  },
});

/** What following a changed Expected Calving did to the work about her, for the trail. */
export interface CalvingWorkFollowed {
  workMoved: { instanceId: string; from: Date; to: Date }[];
  workClosed: string[];
  /** Work closed when a calving stopped being expected, back now that it is again. */
  workReopened: string[];
}

/** Nothing followed: no calving work moved, closed or came back. */
export const nothingFollowed = (): CalvingWorkFollowed => ({
  workMoved: [],
  workClosed: [],
  workReopened: [],
});

/** What the calving work about one cow is keyed on, and when it falls. */
export interface CalvingOf {
  id: string;
  farmId: string;
  lactationNumber: number;
  expectedCalvingAt: Date | null;
}

/**
 * Takes her calving work to where her Expected Calving now is.
 *
 * The Owner's decision (2026-09-13): if the date moves, the work moves with it. Work still open goes
 * to its new day; work already done stays done, and is never raised a second time because its key is
 * the calving, not the date or where the date came from. With no calving expected — a positive put
 * right, or a calving recorded — the open work closes. And when a calving is expected again, in the
 * same Lactation, the work that closed comes back on its new day rather than being lost: a positive
 * corrected away and then corrected back is the same calving. Returned, so the trail says which work
 * went where.
 */
export const followExpectedCalving = async (
  tx: Tx,
  her: CalvingOf,
  leadDays: Record<CalvingLead, number>,
  { expectedAgain }: { expectedAgain: boolean }
): Promise<CalvingWorkFollowed> => {
  const calvingWork = await tx.query.sopInstance.findMany({
    where: {
      farmId: her.farmId,
      animalId: her.id,
      cause: { like: `${calvingWorkPrefix(her.id)}%` },
    },
    columns: { id: true, cause: true, dueAt: true, state: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  const followed = nothingFollowed();
  const key = calvingKeyOf(her);
  for (const work of calvingWork) {
    const parts = calvingCauseParts(work.cause);
    const open = (OPEN_INSTANCE_STATES as readonly string[]).includes(
      work.state
    );
    if (!parts) {
      continue;
    }
    const thisCalving = her.expectedCalvingAt !== null && parts.key === key;
    if (open && !thisCalving) {
      followed.workClosed.push(work.id);
      continue;
    }
    const comesBack = expectedAgain && work.state === "missed" && thisCalving;
    if (!((open || comesBack) && her.expectedCalvingAt)) {
      continue;
    }
    const to = calvingWorkDue(her.expectedCalvingAt, leadDays[parts.lead]);
    if (comesBack) {
      followed.workReopened.push(work.id);
    } else if (to.getTime() === work.dueAt.getTime()) {
      continue;
    } else {
      followed.workMoved.push({ instanceId: work.id, from: work.dueAt, to });
    }
    // Sequential: one row each, and the trail reads them back in the order they went.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(sopInstance)
      .set({ dueAt: to, ...(comesBack ? { state: "due" as const } : {}) })
      .where(eq(sopInstance.id, work.id));
  }
  if (followed.workClosed.length > 0) {
    await tx
      .update(sopInstance)
      .set({ state: "missed" })
      .where(inArray(sopInstance.id, followed.workClosed));
  }
  return followed;
};

/**
 * Times every calving the farm expects again, after the gestation or a lead changed.
 *
 * A date worked out from a service is worked out afresh from that service; a date given at intake is
 * what somebody said and stays. Either way her open work goes to its new day — the same decision as a
 * date that moves for any other reason.
 */
export const retimeEveryCalving = async (
  tx: Tx,
  farmId: string,
  times: PregnancyTimes,
  now: Date
): Promise<CalvingWorkFollowed> => {
  const carrying = await tx.query.animal.findMany({
    where: { farmId, expectedCalvingAt: { isNotNull: true } },
    columns: {
      id: true,
      farmId: true,
      lactationNumber: true,
      expectedCalvingAt: true,
      expectedCalvingServiceId: true,
    },
    orderBy: { id: "asc" },
  });
  const followed = nothingFollowed();
  for (const her of carrying) {
    // Sequential: each cow is her own rows, and there are a few dozen of them at most.
    const served = her.expectedCalvingServiceId
      ? // oxlint-disable-next-line no-await-in-loop
        await tx.query.service.findFirst({
          where: { id: her.expectedCalvingServiceId },
          columns: { servedAt: true },
        })
      : undefined;
    const expectedCalvingAt = served
      ? expectedCalvingFrom(served.servedAt, times.gestationDays)
      : her.expectedCalvingAt;
    if (served) {
      // oxlint-disable-next-line no-await-in-loop
      await tx
        .update(animal)
        .set({ expectedCalvingAt, updatedAt: now })
        .where(eq(animal.id, her.id));
    }
    // oxlint-disable-next-line no-await-in-loop
    const one = await followExpectedCalving(
      tx,
      { ...her, expectedCalvingAt },
      times.calvingLeadDays,
      { expectedAgain: false }
    );
    followed.workMoved.push(...one.workMoved);
    followed.workClosed.push(...one.workClosed);
  }
  return followed;
};

interface Served {
  id: string;
  animalId: string;
  servedAt: Date;
}

/** Every service one cow has had, oldest first — the ones that did not take included. */
const everyServiceOf = (tx: Tx, animalId: string): Promise<Served[]> =>
  tx.query.service.findMany({
    where: { animalId },
    columns: { id: true, animalId: true, servedAt: true },
    orderBy: { servedAt: "asc", id: "asc" },
  });

/** Her latest attempt, or none: the only one whose check is still worth making. */
const latestAttemptOf = async (
  tx: Tx,
  animalId: string
): Promise<Served | null> => {
  const services = await everyServiceOf(tx, animalId);
  return attemptsThatBegin(services).at(-1) ?? null;
};

/**
 * The attempt a piece of work was raised by, while it is still her latest and still stands as it was
 * raised — or null. A check is of the attempt that raised it and nothing else: a Vet cannot tell at
 * a glance which of her heats a pregnancy dates from, and the farm can.
 */
export const attemptThatRaisedWork = async (
  tx: Tx,
  animalId: string,
  cause: string | null
): Promise<Served | null> => {
  const latest = await latestAttemptOf(tx, animalId);
  return latest && cause?.startsWith(`${attemptKeyOf(latest)}:`)
    ? latest
    : null;
};

/**
 * Closes the work raised by attempts that no longer call for it.
 *
 * Only her latest attempt's work is worth doing. A Correction that moves the day she was served, or
 * takes the first service back so the second now begins the attempt, leaves work raised on a day or
 * a service that no longer stands. And a cow served again has come back into heat: the attempt
 * before has answered its own question, and its check would send the Vet to confirm a pregnancy
 * that is not there. Only open work — anything already done was done. The attempt as it now stands
 * raises its own on the next pass.
 */
export const closeWorkOfAttemptsNoLongerStanding = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<void> => {
  const latest = await latestAttemptOf(tx, animalId);
  const standing = latest ? `${attemptKeyOf(latest)}:` : null;
  const open = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      animalId,
      cause: { like: `${ATTEMPT_KEY_PREFIX}%` },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { id: true, cause: true },
  });
  const orphaned = open.filter(
    (work) => !(standing && work.cause?.startsWith(standing))
  );
  if (orphaned.length > 0) {
    await tx
      .update(sopInstance)
      .set({ state: "missed" })
      .where(
        inArray(
          sopInstance.id,
          orphaned.map((work) => work.id)
        )
      );
  }
};

/**
 * Works out, again, what her Pregnancy Checks say about her: when she is expected to calve, and
 * whether a heifer is carrying.
 *
 * A positive stands until something undoes it. Her latest positive check sets Expected Calving at
 * its attempt's first service carried the farm's gestation on, and makes a Heifer a Pregnant
 * Heifer. A negative takes nothing from her: losing a confirmed pregnancy is an Abortion, recorded as
 * one, not a later check that happens to disagree. The one thing that does undo a positive is that
 * positive being put right — corrected to negative, or taken back — and only the caller knows that.
 * A cow with no positive check is otherwise left as she is: a heifer bought in carrying has her due
 * date from her intake, not from a check this farm never made.
 */
export const rederivePregnancy = async (
  tx: Tx,
  animalId: string,
  {
    times,
    at,
    now,
    undoingPositive,
  }: { times: PregnancyTimes; at: Date; now: Date; undoingPositive: boolean }
): Promise<CalvingWorkFollowed> => {
  const [positive] = await tx.query.pregnancyCheck.findMany({
    where: { animalId, result: "positive" },
    columns: { serviceId: true },
    orderBy: { checkedAt: "desc", id: "desc" },
    limit: 1,
  });
  if (!(positive || undoingPositive)) {
    return nothingFollowed();
  }
  const her = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      farmId: true,
      state: true,
      lactationNumber: true,
      expectedCalvingAt: true,
      expectedCalvingServiceId: true,
    },
  });
  if (!her) {
    return nothingFollowed();
  }
  const attempt = positive
    ? attemptOf(await everyServiceOf(tx, animalId), positive.serviceId)
    : null;
  const expectedCalvingAt = attempt
    ? expectedCalvingFrom(attempt.servedAt, times.gestationDays)
    : null;
  let { state } = her;
  if (attempt && state === "heifer") {
    state = "pregnant_heifer";
  } else if (!attempt && state === "pregnant_heifer") {
    state = "heifer";
  }
  await tx
    .update(animal)
    .set({
      expectedCalvingAt,
      expectedCalvingServiceId: attempt?.id ?? null,
      ...(state === her.state ? {} : { state, stateChangedAt: at }),
      updatedAt: now,
    })
    .where(eq(animal.id, animalId));
  return followExpectedCalving(
    tx,
    {
      id: animalId,
      farmId: her.farmId,
      lactationNumber: her.lactationNumber,
      expectedCalvingAt,
    },
    times.calvingLeadDays,
    {
      expectedAgain:
        her.expectedCalvingAt === null && expectedCalvingAt !== null,
    }
  );
};
