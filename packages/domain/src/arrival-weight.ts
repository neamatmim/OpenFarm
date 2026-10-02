import { EARLY_DAYS } from "./early-losses";

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a bought animal weighed coming off the lorry, and when. */
export interface BoughtAt {
  arrivalKg: number;
  arrivedAt: Date;
}

/** A reading on the farm's own scale. */
export interface ScaleReading {
  weightKg: number;
  weighedAt: Date;
}

/**
 * How far a bought animal's first Weigh-in came under the weight she was bought at, where it matters: a lorry takes
 * weight off a bull and a fortnight's rest puts it back, so a well bull weighs more than he arrived at, not less. More
 * than `percent` under, within the quarantine's thirty days, is a purchase to ask about; past those days, what she weighs
 * is her keeping's business. Nothing within the line.
 */
export const weighedShort = (
  arrival: BoughtAt,
  first: ScaleReading,
  percent: number
): { shortKg: number; percent: number; days: number } | null => {
  const days =
    (first.weighedAt.getTime() - arrival.arrivedAt.getTime()) / DAY_MS;
  if (days < 0 || days >= EARLY_DAYS || arrival.arrivalKg <= 0) {
    return null;
  }
  const shortKg = arrival.arrivalKg - first.weightKg;
  const part = (shortKg / arrival.arrivalKg) * 100;
  if (part <= percent) {
    return null;
  }
  return {
    shortKg: Math.round(shortKg * 100) / 100,
    percent: Math.round(part * 10) / 10,
    days: Math.round(days),
  };
};
