import type { Database } from "@OpenFarm/db";
import { eq, inArray } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type {
  CalvingLead,
  PregnancyCheckResult,
  RepeatBreederDecision,
  ServiceMethod,
} from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  attemptOf,
  attemptsThatFailed,
  isRepeatBreeder,
  sinceSheLastCalved,
  attemptsThatBegin,
  expectedCalvingFrom,
  farmDayOf,
  isExitState,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { CalvingWorkFollowed } from "./calving-work";
import { followExpectedCalving, nothingFollowed } from "./calving-work";
import { entersState } from "./herd-store";
import { ATTEMPT_KEY_PREFIX, attemptKeyOf } from "./instances-store";
import type { Who } from "./work-moves";
import { callOffWork } from "./work-moves";

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
  now: Date,
  who: Who
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
      { expectedAgain: false, who }
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
 * that is not there. Only open work — anything already done was done, and the work is called off rather than Missed.
 * The attempt as it now stands raises its own on the next pass.
 */
export const callOffWorkOfAttemptsNoLongerStanding = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  who: Who
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
    await callOffWork(
      tx,
      farmId,
      inArray(
        sopInstance.id,
        orphaned.map((work) => work.id)
      ),
      { who, by: "attempt_no_longer_standing" }
    );
  }
};

/**
 * The pregnancy her latest positive check found, while it is still hers to carry — or null.
 *
 * One the Vet recorded as lost is not brought back, and one she has already calved from is behind
 * her. Falling back to an older positive would set a calving that happened long ago.
 */
const pregnancyStillCarried = async (
  tx: Tx,
  animalId: string,
  lastCalvedAt: Date | null
): Promise<Served | null> => {
  const [latest] = await tx.query.pregnancyCheck.findMany({
    where: { animalId, result: "positive" },
    columns: { serviceId: true },
    orderBy: { checkedAt: "desc", id: "desc" },
    limit: 1,
  });
  const attempt = latest
    ? attemptOf(await everyServiceOf(tx, animalId), latest.serviceId)
    : null;
  if (!attempt) {
    return null;
  }
  const lost = await tx.query.abortion.findFirst({
    where: { animalId, serviceId: attempt.id },
    columns: { id: true },
  });
  const calvedSince = lastCalvedAt !== null && attempt.servedAt <= lastCalvedAt;
  return lost || calvedSince ? null : attempt;
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
    who,
  }: {
    times: PregnancyTimes;
    at: Date;
    now: Date;
    undoingPositive: boolean;
    /** Who put the pregnancy right, as the trail of the calving work it moves names them. */
    who: Who;
  }
): Promise<CalvingWorkFollowed> => {
  const her = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      farmId: true,
      side: true,
      state: true,
      lactationNumber: true,
      lactationStartedAt: true,
      expectedCalvingAt: true,
      expectedCalvingServiceId: true,
    },
  });
  // Her Pregnancy Checks go on saying what they say; a date to prepare for is only worked out for a cow on the Dairy
  // side who is still here. Crossed to Fattening or gone, the forecast went with her and does not come back.
  if (!her || her.side !== "dairy" || isExitState(her.state)) {
    return nothingFollowed();
  }
  const carrying = await pregnancyStillCarried(
    tx,
    animalId,
    her.lactationStartedAt
  );
  // A date given at intake is somebody's word, not a check's: only undoing a positive, or a derived
  // date whose pregnancy no longer stands, clears anything.
  const derived = her.expectedCalvingServiceId !== null;
  if (!(carrying || undoingPositive || derived)) {
    return nothingFollowed();
  }
  const expectedCalvingAt = carrying
    ? expectedCalvingFrom(carrying.servedAt, times.gestationDays)
    : null;
  let { state } = her;
  if (carrying && state === "heifer") {
    state = "pregnant_heifer";
  } else if (!carrying && state === "pregnant_heifer") {
    state = "heifer";
  }
  await tx
    .update(animal)
    .set({
      expectedCalvingAt,
      expectedCalvingServiceId: carrying?.id ?? null,
      updatedAt: now,
    })
    .where(eq(animal.id, animalId));
  await entersState(
    tx,
    her.farmId,
    { id: animalId, side: her.side, state: her.state },
    { state, at, now }
  );
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
      who,
    }
  );
};

/** One cow as the Repeat Breeder question reads her: her services since she last calved, her checks,
 *  and the last answer anybody gave. */
interface BreedingHistory {
  id: string;
  tagNumber: string;
  expectedCalvingAt: Date | null;
  lactationStartedAt: Date | null;
  services: {
    id: string;
    animalId: string;
    servedAt: Date;
    method: ServiceMethod;
    sireStraw: string | null;
    servedBy: string | null;
    sire: { tagNumber: string } | null;
  }[];
  pregnancyChecks: {
    id: string;
    serviceId: string;
    result: PregnancyCheckResult;
    checkedAt: Date;
  }[];
  repeatBreederAnswers: {
    decision: RepeatBreederDecision;
    note: string;
    failedAttempts: number;
    answeredAt: Date;
  }[];
}

/** What a cow's history reads for a Repeat Breeder and the columns to read it with. */
const historyColumns = {
  columns: {
    id: true,
    tagNumber: true,
    expectedCalvingAt: true,
    lactationStartedAt: true,
  },
  with: {
    services: {
      columns: {
        id: true,
        animalId: true,
        servedAt: true,
        method: true,
        sireStraw: true,
        servedBy: true,
      },
      with: { sire: { columns: { tagNumber: true } } },
      orderBy: { servedAt: "asc", id: "asc" },
    },
    pregnancyChecks: {
      columns: { id: true, serviceId: true, result: true, checkedAt: true },
    },
    repeatBreederAnswers: {
      columns: {
        decision: true,
        note: true,
        failedAttempts: true,
        answeredAt: true,
      },
      orderBy: { answeredAt: "desc", id: "desc" },
      limit: 1,
    },
  },
} as const;

/**
 * The Repeat Breeder question about one cow: the attempts since she last calved that did not take —
 * how she was served, by what sire and whom, and whether the Vet found her empty or she came back into
 * heat — and whether that makes her one somebody has to decide about.
 */
const repeatBreederOf = (her: BreedingHistory, threshold: number) => {
  const failures = attemptsThatFailed(
    sinceSheLastCalved(her.services, her.lactationStartedAt),
    her.pregnancyChecks
  );
  const [lastAnswer] = her.repeatBreederAnswers;
  return {
    flagged: isRepeatBreeder({
      failed: failures.length,
      threshold,
      answeredAtFailures: lastAnswer?.failedAttempts ?? null,
      carrying: her.expectedCalvingAt !== null,
    }),
    animalId: her.id,
    tagNumber: her.tagNumber,
    failedAttempts: failures.length,
    failures: failures.map((one) => ({
      serviceId: one.id,
      servedAt: one.servedAt,
      method: one.method,
      sire: one.sire?.tagNumber ?? one.sireStraw,
      servedBy: one.servedBy,
      why: one.why,
    })),
    lastAnswer: lastAnswer ?? null,
  };
};

/**
 * The cows the Manager has to decide about: failed the farm's threshold of attempts since she last
 * calved, and failed again since anybody last answered for her.
 *
 * On the Manager's queue and on nobody's phone (the Owner, 2026-09-13): a cull-or-treat decision
 * deserves somebody sitting down with it. Worked out afresh each time it is read, so an answered
 * flag stays answered and one nobody has answered stays until somebody does. A cow with fewer
 * services than the threshold cannot have failed that many, and is not worked through.
 */
export const repeatBreedersOn = async (
  db: Pick<Database, "query">,
  farmId: string,
  threshold: number
) => {
  const cows = await db.query.animal.findMany({
    where: {
      farmId,
      sex: "female",
      side: "dairy",
      state: { in: ["heifer", "pregnant_heifer", "milking", "dry"] },
    },
    ...historyColumns,
    orderBy: { tagNumber: "asc" },
  });
  return cows
    .filter((her) => her.services.length >= threshold)
    .map((her) => repeatBreederOf(her, threshold))
    .filter((question) => question.flagged)
    .map(({ flagged: _flagged, ...row }) => row);
};

/** The Repeat Breeder question about one cow, read inside the transaction that answers it. */
export const repeatBreederFor = async (
  tx: Tx,
  animalId: string,
  threshold: number
) => {
  const her = await tx.query.animal.findFirst({
    where: { id: animalId },
    ...historyColumns,
  });
  return her ? repeatBreederOf(her, threshold) : null;
};

/** The abortion as the trail records it either side of a change. */
export const readAbortion = async (tx: Tx, id: string) =>
  (await tx.query.abortion.findFirst({ where: { id } })) ?? null;

/**
 * When a pregnancy can have been lost: not later than now, and not before the service it came from.
 * A late entry dated before she was served is a date written wrong, and it would clear a pregnancy
 * she had not begun.
 */
export const assertLostWhenItCouldBe = async (
  tx: Tx,
  abortedAt: Date,
  now: Date,
  serviceId: string | null
) => {
  if (abortedAt > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An abortion cannot have happened later than now",
      data: { refusal: "aborted_in_the_future" },
    });
  }
  const served = serviceId
    ? await tx.query.service.findFirst({
        where: { id: serviceId },
        columns: { servedAt: true },
      })
    : undefined;
  if (served && abortedAt < served.servedAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An abortion cannot be earlier than the service it ends",
      data: { refusal: "aborted_before_she_was_served" },
    });
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The farm day somebody said she will calve, refused when it has gone or is further off than a cow
 *  carries. */
export const expectedCalvingWithinReach = (
  day: string,
  now: Date,
  gestationDays: number
): Date => {
  const due = startOfFarmDay(day);
  if (Number.isNaN(due.getTime())) {
    throw new ORPCError("BAD_REQUEST", { message: `"${day}" is not a day` });
  }
  if (due < startOfFarmDay(farmDayOf(now))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That day has already gone",
      data: { refusal: "expected_calving_passed" },
    });
  }
  if (due.getTime() > now.getTime() + gestationDays * DAY_MS) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No cow calves further off than a whole gestation",
      data: { refusal: "expected_calving_too_far" },
    });
  }
  return due;
};
