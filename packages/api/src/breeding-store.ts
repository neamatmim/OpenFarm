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
  calvingCauseOf,
  calvingCauseParts,
  calvingKeyOf,
  calvingWorkPrefix,
} from "./instances-store";

/** The Farm Parameters a pregnancy is timed by: how long a cow carries, and how long before she is
 *  due each piece of calving work falls. */
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
}

const NOTHING_FOLLOWED: CalvingWorkFollowed = { workMoved: [], workClosed: [] };

/**
 * Takes her open calving work to where her Expected Calving now is.
 *
 * The Owner's decision (2026-09-13): if the date moves, the work moves with it. Work still open goes
 * to its new day — and carries the pregnancy's new key, if the date now comes from somewhere else —
 * while work already done stays done. With no calving expected, there is nothing to prepare for and
 * the open work closes. Returned, so the trail says which work went where.
 */
export const followExpectedCalving = async (
  tx: Tx,
  farmId: string,
  her: {
    id: string;
    lactationNumber: number;
    expectedCalvingAt: Date | null;
    expectedCalvingServiceId: string | null;
  },
  leadDays: Record<CalvingLead, number>
): Promise<CalvingWorkFollowed> => {
  const hers = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      animalId: her.id,
      cause: { like: `${calvingWorkPrefix(her.id)}%` },
    },
    columns: {
      id: true,
      definitionId: true,
      cause: true,
      dueAt: true,
      state: true,
    },
  });
  const taken = new Set(
    hers.map((work) => `${work.definitionId}|${work.cause}`)
  );
  const followed: CalvingWorkFollowed = { workMoved: [], workClosed: [] };
  const key = her.expectedCalvingAt ? calvingKeyOf(her) : null;
  const open = hers.filter((work) =>
    (OPEN_INSTANCE_STATES as readonly string[]).includes(work.state)
  );
  for (const work of open) {
    const parts = calvingCauseParts(work.cause);
    if (!parts) {
      continue;
    }
    const cause = key ? calvingCauseOf(key, parts.lead) : null;
    // The same work already stands under the new key — raised for this pregnancy once before and
    // closed — so this one is not moved on top of it.
    const clashes =
      cause !== null &&
      cause !== work.cause &&
      taken.has(`${work.definitionId}|${cause}`);
    if (!(her.expectedCalvingAt && cause) || clashes) {
      followed.workClosed.push(work.id);
      continue;
    }
    const to = calvingWorkDue(her.expectedCalvingAt, leadDays[parts.lead]);
    if (to.getTime() === work.dueAt.getTime() && cause === work.cause) {
      continue;
    }
    // Sequential: each move is checked against the causes the ones before it took.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(sopInstance)
      .set({ dueAt: to, cause })
      .where(eq(sopInstance.id, work.id));
    taken.add(`${work.definitionId}|${cause}`);
    if (to.getTime() !== work.dueAt.getTime()) {
      followed.workMoved.push({ instanceId: work.id, from: work.dueAt, to });
    }
  }
  if (followed.workClosed.length > 0) {
    await tx
      .update(sopInstance)
      .set({ state: "missed" })
      .where(inArray(sopInstance.id, followed.workClosed));
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
    return NOTHING_FOLLOWED;
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
    return NOTHING_FOLLOWED;
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
    her.farmId,
    {
      id: animalId,
      lactationNumber: her.lactationNumber,
      expectedCalvingAt,
      expectedCalvingServiceId: attempt?.id ?? null,
    },
    times.calvingLeadDays
  );
};
