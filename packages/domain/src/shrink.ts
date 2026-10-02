import { roundKg } from "./feed";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How old her last weighing may be before the weight she lost is said with its age: a fortnight between Weigh-ins and a
 * week more. Older, and she may have gained since — the figure is still shown, but as a reading of that day.
 */
export const SHRINK_STALE_DAYS = 21;

/** The weight she lost between her last weighing on the farm and the scale she was sold on. */
export interface Shrink {
  lastKg: number;
  /** Kilos lost; less than nothing where she weighed more at the sale, which is as likely a scale or a slip. */
  lostKg: number;
  /** Of her last weight, to a tenth. */
  percent: number;
  /** Whole days between the two readings. */
  days: number;
  /** Her last weighing is older than the farm trusts for this. */
  stale: boolean;
}

/**
 * **Shrink**: what she weighed last on the farm against what the sale's scale said — the lorry, the haat, a night without
 * water. Nothing without both weights.
 */
export const shrinkOf = ({
  lastKg,
  lastAt,
  saleKg,
  saleAt,
}: {
  lastKg: number;
  lastAt: Date;
  saleKg: number;
  saleAt: Date;
}): Shrink | null => {
  if (lastKg <= 0 || saleKg <= 0) {
    return null;
  }
  const lostKg = roundKg(lastKg - saleKg);
  const days = Math.max(
    0,
    Math.floor((saleAt.getTime() - lastAt.getTime()) / DAY_MS)
  );
  return {
    lastKg,
    lostKg,
    percent: Math.round((lostKg / lastKg) * 1000) / 10,
    days,
    stale: days > SHRINK_STALE_DAYS,
  };
};

/**
 * The shrink of several sold on one outing, weighed by their weight — a heavy bull's twenty kilos count as his, not as one
 * vote beside a calf's. Nothing where none of them had both weights.
 */
export const shrinkOfMany = (
  shrinks: readonly (Shrink | null)[]
): { lostKg: number; percent: number; animals: number } | null => {
  const known = shrinks.filter((one): one is Shrink => one !== null);
  if (known.length === 0) {
    return null;
  }
  let lost = 0;
  let last = 0;
  for (const one of known) {
    lost += one.lostKg;
    last += one.lastKg;
  }
  return {
    lostKg: roundKg(lost),
    percent: Math.round((lost / last) * 1000) / 10,
    animals: known.length,
  };
};

/**
 * The weight a fattening Sale's low price a kilo is set against: the heavier of what the sale's scale said and her last
 * weighing on the farm less the farm's allowance for Shrink — a weight typed low cannot lower the floor with it. Her
 * last weighing counts only while it is still trusted (`SHRINK_STALE_DAYS`); says which weight it was.
 */
export const floorWeightOf = ({
  saleKg,
  last,
  soldAt,
  allowPercent,
}: {
  saleKg: number;
  last: { weightKg: number; at: Date } | null;
  soldAt: Date;
  allowPercent: number;
}): { weightKg: number; from: "scale" | "day" } => {
  if (last) {
    const days = (soldAt.getTime() - last.at.getTime()) / DAY_MS;
    const allowed = roundKg(last.weightKg * (1 - allowPercent / 100));
    if (days >= 0 && days <= SHRINK_STALE_DAYS && allowed > saleKg) {
      return { weightKg: allowed, from: "scale" };
    }
  }
  return { weightKg: saleKg, from: "day" };
};

/** Whether she lost more than the farm allows a lorry to take off a bull, on a weighing still trusted. */
export const shrankPast = (
  shrink: Shrink | null,
  allowPercent: number
): boolean => shrink !== null && !shrink.stale && shrink.percent > allowPercent;
