const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When and at what weight DLS has a heifer first served (NG-GLPP 2023): a cross at 18 to 20 months (§7.2.3.1.1), its
 * weight "monitored regularly" toward "about 250 and 300 kg at 18 months" (§12.1.1.1(l)) — 55 to 60 per cent of the
 * 433–493 kg the country's crossbred cows reach; an indigenous heifer at 30 months, at 250 kg the "optimum weight at
 * first mating" (Appendix 26). Puberty "is governed by size and weight, not age", so the weight is the aim and the age
 * the day it is read on. The ages are the months in days (docs/research/cow-watch.md §3).
 */
export const HEIFER_SERVICE = {
  cross: { ageDays: 548, weightKg: 250 },
  deshi: { ageDays: 913, weightKg: 250 },
} as const;

/** Two weighings closer than this say more about the scale and a full belly than about how she grows. */
const FEWEST_DAYS_FOR_A_GAIN = 28;

/** One heifer as her growth is read: when she was born, whether she is deshi, and what she has weighed. */
export interface HeiferWeights {
  bornAt: Date | null;
  deshi: boolean;
  weights: readonly { weightKg: number; weighedAt: Date }[];
}

export interface HeiferGrowth {
  /** Days old today; nothing where her birth is not known. */
  ageDays: number | null;
  latest: { weightKg: number; weighedAt: Date } | null;
  /** Kilograms a day from her first weighing to her latest — her birth weight, when she was weighed at birth. */
  gainPerDay: number | null;
  /** The weight and age DLS has her served at. */
  aim: { ageDays: number; weightKg: number };
  /** What she will weigh on the day she reaches the aim's age, at the gain she has kept up — or, past it, what she last
   *  weighed. Nothing until both her gain and her age are known. */
  atServiceAgeKg: number | null;
  /** Already at the aim's weight: ready to serve by weight, whatever her age. */
  reached: boolean;
  /** Will be short of the aim's weight at its age, or is past the age and short: her feed wants looking at. */
  behind: boolean;
}

const daysBetween = (from: Date, to: Date) =>
  (to.getTime() - from.getTime()) / DAY_MS;

/** Her gain a day over her first and latest weighings, when they are far enough apart to say one. */
const gainOf = (
  first: { weightKg: number; weighedAt: Date } | undefined,
  latest: { weightKg: number; weighedAt: Date } | undefined
): number | null => {
  if (first === undefined || latest === undefined) {
    return null;
  }
  const days = daysBetween(first.weighedAt, latest.weighedAt);
  if (days < FEWEST_DAYS_FOR_A_GAIN) {
    return null;
  }
  return Math.round(((latest.weightKg - first.weightKg) / days) * 100) / 100;
};

/** What she will weigh at the aim's age at her gain — or what she last weighed once past it. */
const atServiceAgeOf = (
  latest: { weightKg: number; weighedAt: Date },
  bornAt: Date,
  gainPerDay: number,
  aimAgeDays: number
): number => {
  const ageWhenWeighed = daysBetween(bornAt, latest.weighedAt);
  const daysToGo = Math.max(aimAgeDays - ageWhenWeighed, 0);
  return Math.round(latest.weightKg + gainPerDay * daysToGo);
};

/** A heifer's growth toward the weight DLS has her first served at, as of `now`. */
export const heiferGrowthOf = (
  heifer: HeiferWeights,
  now: Date
): HeiferGrowth => {
  const aim = heifer.deshi ? HEIFER_SERVICE.deshi : HEIFER_SERVICE.cross;
  const readings = heifer.weights.toSorted(
    (a, b) => a.weighedAt.getTime() - b.weighedAt.getTime()
  );
  const first = readings.at(0);
  const latest = readings.at(-1) ?? null;
  const gainPerDay = gainOf(first, latest ?? undefined);
  const ageDays =
    heifer.bornAt === null ? null : Math.floor(daysBetween(heifer.bornAt, now));
  const reached = latest !== null && latest.weightKg >= aim.weightKg;
  const atServiceAgeKg =
    latest === null || heifer.bornAt === null || gainPerDay === null
      ? null
      : atServiceAgeOf(latest, heifer.bornAt, gainPerDay, aim.ageDays);
  return {
    ageDays,
    latest,
    gainPerDay,
    aim,
    atServiceAgeKg,
    reached,
    behind:
      !reached && atServiceAgeKg !== null && atServiceAgeKg < aim.weightKg,
  };
};
