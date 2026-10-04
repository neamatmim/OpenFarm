import type { PregnancyCheckResult } from "./breeding";
import { attemptOf, attemptsThatBegin, attemptsThatFailed } from "./breeding";

/**
 * How quickly the farm's cows get back in calf — the measures a dairy is judged by, worked from the Services,
 * Pregnancy Checks and Calvings the farm already records (docs/research/cow-watch.md §2–3). A cow giving milk a year
 * longer than she should between calves is the dairy's largest quiet loss: Bangladeshi crossbreds average 394–416
 * days between calvings against DLS's 360–380.
 *
 * Counted in Attempts, not services: a cow served twice in one heat tried once (CONTEXT: Attempt).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_A_MONTH = 30.44;

/** What DLS asks of a profitable dairy cow (NG-GLPP §10.1.3.2(a), §4.1.2.1.2; cow-watch.md). */
export const FERTILITY_TARGETS = {
  /** "An inter-calving interval of 360 to 380 days." */
  calvingIntervalDays: { low: 360, high: 380 },
  /** "60-85 days open period." */
  daysOpen: { low: 60, high: 85 },
  /** "Calving to first service 60 days or less." */
  daysToFirstService: { low: 40, high: 60 },
} as const;

/** One cow as the measures read her. */
export interface CowBreeding {
  id: string;
  tagNumber: string;
  bornAt: Date | null;
  calvings: readonly {
    calvedAt: Date;
    serviceId: string | null;
    /** Her Lactation it began; nothing where the farm does not know it. Age at first calving reads only the first. */
    lactationNumber: number | null;
  }[];
  services: readonly { id: string; animalId: string; servedAt: Date }[];
  checks: readonly {
    id: string;
    serviceId: string;
    result: PregnancyCheckResult;
    checkedAt: Date;
  }[];
}

/** One stretch of a cow's breeding: from a calving — or her birth, as a heifer — to the Attempt she settled from. */
export interface BreedingCycle {
  cowId: string;
  tagNumber: string;
  /** The calving that opened it; nothing for a heifer's first. */
  calvedAt: Date | null;
  /** The first service of her first Attempt in it. */
  firstServiceAt: Date | null;
  /** Her Attempts in it, up to and including the one that took. */
  attempts: number;
  /** The first service of the Attempt she settled from; nothing while she is open. */
  conceivedAt: Date | null;
  /** The calving that closed it; nothing while she is still carrying or open. */
  nextCalvedAt: Date | null;
}

/** The Attempts that took: the one each Calving says she was served for, and any the Vet last found positive. */
const attemptsThatTook = (cow: CowBreeding): Set<string> => {
  const services = [...cow.services];
  const took = new Set<string>();
  for (const calving of cow.calvings) {
    const attempt = calving.serviceId
      ? attemptOf(services, calving.serviceId)
      : null;
    if (attempt) {
      took.add(attempt.id);
    }
  }
  const failed = new Set(
    attemptsThatFailed(services, [...cow.checks]).map((one) => one.id)
  );
  for (const check of cow.checks) {
    const attempt = attemptOf(services, check.serviceId);
    if (check.result === "positive" && attempt && !failed.has(attempt.id)) {
      took.add(attempt.id);
    }
  }
  return took;
};

/** One cow's cycles, oldest first: a heifer's from birth, then one from each calving. */
export const cyclesOf = (cow: CowBreeding): BreedingCycle[] => {
  const attempts = attemptsThatBegin([...cow.services]).toSorted(
    (a, b) => a.servedAt.getTime() - b.servedAt.getTime()
  );
  const took = attemptsThatTook(cow);
  const calvings = cow.calvings.toSorted(
    (a, b) => a.calvedAt.getTime() - b.calvedAt.getTime()
  );
  const opens: (Date | null)[] = [null, ...calvings.map((one) => one.calvedAt)];
  return opens.map((calvedAt, index) => {
    const nextCalvedAt = calvings[index]?.calvedAt ?? null;
    const inIt = attempts.filter(
      (one) =>
        (calvedAt === null || one.servedAt > calvedAt) &&
        (nextCalvedAt === null || one.servedAt < nextCalvedAt)
    );
    const settled = inIt.findIndex((one) => took.has(one.id));
    return {
      cowId: cow.id,
      tagNumber: cow.tagNumber,
      calvedAt,
      firstServiceAt: inIt[0]?.servedAt ?? null,
      attempts: settled === -1 ? inIt.length : settled + 1,
      conceivedAt: settled === -1 ? null : (inIt[settled]?.servedAt ?? null),
      nextCalvedAt,
    };
  });
};

const daysBetween = (from: Date, to: Date) =>
  (to.getTime() - from.getTime()) / DAY_MS;

const meanOf = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : Math.round(values.reduce((sum, one) => sum + one, 0) / values.length);

const within = (at: Date | null, from: Date, until: Date): at is Date =>
  at !== null && at >= from && at < until;

/** The herd's measures over a stretch, each read from the events that fell in it. */
export interface HerdFertility {
  /** Days between a cow's calvings, for calvings in the stretch that followed another. */
  calvingIntervalDays: number | null;
  calvingIntervals: number;
  /** Days from calving to the Attempt she settled from, for those that took in the stretch. */
  daysOpen: number | null;
  conceptions: number;
  /** Days from calving to her first service, for first services in the stretch. */
  daysToFirstService: number | null;
  firstServices: number;
  /** Of the Attempts begun in the stretch whose outcome is known, the share that took. */
  conceptionRate: number | null;
  attemptsKnown: number;
  /** Months from birth to her first calving, for first calvings in the stretch of cows whose birth is known. */
  ageAtFirstCalvingMonths: number | null;
  firstCalvings: number;
}

/** The herd's measures from its cows' cycles, over `from`–`until`. */
export const herdFertility = (
  cows: readonly CowBreeding[],
  { from, until }: { from: Date; until: Date }
): HerdFertility => {
  const cycles = cows.flatMap(cyclesOf);
  const afterCalving = cycles.filter(
    (one): one is BreedingCycle & { calvedAt: Date } => one.calvedAt !== null
  );
  const intervals = afterCalving.flatMap((one) =>
    within(one.nextCalvedAt, from, until)
      ? [daysBetween(one.calvedAt, one.nextCalvedAt)]
      : []
  );
  const open = afterCalving.flatMap((one) =>
    within(one.conceivedAt, from, until)
      ? [daysBetween(one.calvedAt, one.conceivedAt)]
      : []
  );
  const toFirst = afterCalving.flatMap((one) =>
    within(one.firstServiceAt, from, until)
      ? [daysBetween(one.calvedAt, one.firstServiceAt)]
      : []
  );
  const outcomes = cows.flatMap((cow) => {
    const took = attemptsThatTook(cow);
    const failed = new Set(
      attemptsThatFailed([...cow.services], [...cow.checks]).map(
        (one) => one.id
      )
    );
    return attemptsThatBegin([...cow.services]).flatMap((attempt) => {
      const known = took.has(attempt.id) || failed.has(attempt.id);
      return known && within(attempt.servedAt, from, until)
        ? [took.has(attempt.id)]
        : [];
    });
  });
  // Her first Lactation's calving, not the first the farm happened to record: a cow on the opening register in her
  // third would read as calving first at five years old.
  const firstCalvings = cows.flatMap((cow) => {
    const first = cow.calvings.find((one) => one.lactationNumber === 1);
    return cow.bornAt && first && within(first.calvedAt, from, until)
      ? [daysBetween(cow.bornAt, first.calvedAt) / DAYS_A_MONTH]
      : [];
  });
  const took = outcomes.filter(Boolean).length;
  return {
    calvingIntervalDays: meanOf(intervals),
    calvingIntervals: intervals.length,
    daysOpen: meanOf(open),
    conceptions: open.length,
    daysToFirstService: meanOf(toFirst),
    firstServices: toFirst.length,
    conceptionRate: outcomes.length === 0 ? null : took / outcomes.length,
    attemptsKnown: outcomes.length,
    ageAtFirstCalvingMonths:
      firstCalvings.length === 0
        ? null
        : Math.round(
            (firstCalvings.reduce((sum, one) => sum + one, 0) /
              firstCalvings.length) *
              10
          ) / 10,
    firstCalvings: firstCalvings.length,
  };
};

/** Each cow in milk or dry now: how long since she calved, whether she has settled, and her Attempts since. */
export interface CowSinceCalving {
  cowId: string;
  tagNumber: string;
  calvedAt: Date;
  daysSinceCalving: number;
  attempts: number;
  /** Days from calving to the Attempt she settled from; nothing while she is open. */
  daysOpen: number | null;
  /** Days between her last two calvings; nothing for a first calver. */
  lastCalvingIntervalDays: number | null;
}

/** Every cow's cycle since her latest calving, the longest open first. */
export const cowsSinceCalving = (
  cows: readonly CowBreeding[],
  now: Date
): CowSinceCalving[] =>
  cows
    .flatMap((cow): CowSinceCalving[] => {
      const cycles = cyclesOf(cow);
      const latest = cycles.at(-1);
      const before = cycles.at(-2);
      if (!latest?.calvedAt) {
        return [];
      }
      return [
        {
          cowId: cow.id,
          tagNumber: cow.tagNumber,
          calvedAt: latest.calvedAt,
          daysSinceCalving: Math.floor(daysBetween(latest.calvedAt, now)),
          attempts: latest.attempts,
          daysOpen: latest.conceivedAt
            ? Math.round(daysBetween(latest.calvedAt, latest.conceivedAt))
            : null,
          lastCalvingIntervalDays: before?.calvedAt
            ? Math.round(daysBetween(before.calvedAt, latest.calvedAt))
            : null,
        },
      ];
    })
    .toSorted(
      (a, b) =>
        Number(a.daysOpen !== null) - Number(b.daysOpen !== null) ||
        b.daysSinceCalving - a.daysSinceCalving ||
        a.tagNumber.localeCompare(b.tagNumber)
    );
