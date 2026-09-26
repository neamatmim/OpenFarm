import type { Kept } from "./animal-price";
import { KEEP_NEEDS_DAYS, inTheKeepWindow } from "./animal-price";
import { roundLitres } from "./milk";
import { roundTaka } from "./money";

/**
 * Why the farm names a dairy cow to the Owner as one to think about letting go (the Owner, 2026-09-27): her milk earns
 * less than her keep, she is empty long after calving or dry and empty, or she will not settle. Worked out, never
 * entered, and never a decision — culling her is still a Sale to a butcher, or a Mortality.
 */
export const CULL_REASONS = [
  "milk_short",
  "open_long",
  "repeat_breeder",
] as const;
export type CullReason = (typeof CULL_REASONS)[number];

/** Days into her Lactation before her milk is weighed against her keep: her first week's milk is her calf's, and the
 *  four weeks after it are what is read. */
export const MILK_NEEDS_DAYS_IN_MILK = 35;

/** How far back the farm's own Dispatches are read for what a litre fetches: two months of a milk buyer. */
export const MILK_PRICE_DAYS = 60;

/**
 * What a litre fetched across some of the farm's Dispatches: everything they fetched over every litre they took, so a
 * big tanker counts for its litres, not as one vote beside a can at the gate. Nothing where no milk left.
 */
export const milkPriceOf = (
  dispatches: readonly { litres: number; pricePerLitreBdt: number }[]
): { bdtPerLitre: number; litres: number } | null => {
  const litres = dispatches.reduce((sum, one) => sum + one.litres, 0);
  if (litres <= 0) {
    return null;
  }
  const bdt = dispatches.reduce(
    (sum, one) => sum + one.litres * one.pricePerLitreBdt,
    0
  );
  return { bdtPerLitre: roundTaka(bdt / litres), litres: roundLitres(litres) };
};

/** The litres she sent to Bulk inside her last four weeks, read over the same days as her keep. */
export const litresOver = (
  milked: readonly { at: Date; litres: number }[],
  now: Date
): number =>
  roundLitres(
    milked
      .filter((one) => inTheKeepWindow(one.at, now))
      .reduce((sum, one) => sum + one.litres, 0)
  );

/** Why the farm cannot weigh her milk against her keep yet. */
export type MilkUnknown = "too_soon" | "not_fed" | "no_price";

export type MilkAgainstKeep =
  | { known: false; because: MilkUnknown }
  | {
      known: true;
      /** The days of her last four weeks she was here, which both sums are over. */
      days: number;
      litres: number;
      litresPerDay: number;
      /** What a litre fetched in the farm's Dispatches of the last two months. */
      bdtPerLitre: number;
      /** What her litres fetch at that. */
      worthBdt: number;
      keepBdt: number;
      /** What her milk leaves over her keep; negative where it falls short. */
      overKeepBdt: number;
      /** What a litre of hers costs to make lately; nothing while she sent none to Bulk. */
      costPerLitreBdt: number | null;
      /** False when some feed or a dose in her keep had no price: it is short by that, and so kinder to her. */
      whole: boolean;
    };

/**
 * Her milk against her keep over her last four weeks: what the litres she sent to Bulk fetch at what the farm's own
 * Dispatches got a litre, set beside what keeping her cost. Milk to her calf or poured away under Withdrawal fetched
 * nothing, so it counts for nothing — a treatment costs the milk it spoils as well as the dose.
 *
 * Not weighed, and said why, until she is five weeks into her Lactation, while no Feeding was charged to her in the four
 * weeks, or while the farm sold no milk in two months to put a price on a litre.
 */
export const milkAgainstKeep = ({
  kept,
  litres,
  daysInMilk,
  price,
}: {
  kept: Kept;
  litres: number;
  daysInMilk: number | null;
  price: { bdtPerLitre: number } | null;
}): MilkAgainstKeep => {
  const tooSoon =
    daysInMilk === null ||
    daysInMilk < MILK_NEEDS_DAYS_IN_MILK ||
    kept.days < KEEP_NEEDS_DAYS;
  if (tooSoon) {
    return { known: false, because: "too_soon" };
  }
  if (!kept.fed) {
    return { known: false, because: "not_fed" };
  }
  if (price === null) {
    return { known: false, because: "no_price" };
  }
  const worthBdt = roundTaka(litres * price.bdtPerLitre);
  const keepBdt = roundTaka(kept.bdt);
  return {
    known: true,
    days: Math.round(kept.days),
    litres,
    litresPerDay: roundLitres(litres / kept.days),
    bdtPerLitre: price.bdtPerLitre,
    worthBdt,
    keepBdt,
    // From the figures as they are shown, so what is left over is what the two lines come to.
    overKeepBdt: roundTaka(worthBdt - keepBdt),
    costPerLitreBdt: litres > 0 ? roundTaka(kept.bdt / litres) : null,
    whole: kept.whole,
  };
};

/**
 * Every reason the farm has to name her, in one order, so two cows named for the same things read alike. A cow in calf
 * is never named for her milk or for being empty: she will calve and milk again, and a cow near her dry-off is meant to
 * be giving little. A Repeat Breeder is one only while nobody has found her carrying, so that reason needs no such
 * guard here.
 */
export const cullReasonsOf = ({
  state,
  inCalf,
  daysSinceCalving,
  openDays,
  milk,
  repeatBreeder,
}: {
  state: string;
  inCalf: boolean;
  daysSinceCalving: number | null;
  /** The Farm Parameter: how many days after calving a cow still empty is named — 150 unless the Owner says
   *  otherwise, well past the second or third heat a cow that is going to settle has settled on. */
  openDays: number;
  milk: MilkAgainstKeep | null;
  repeatBreeder: boolean;
}): CullReason[] => {
  const reasons: CullReason[] = [];
  const milkShort =
    state === "milking" && !inCalf && milk?.known === true
      ? milk.overKeepBdt < 0
      : false;
  if (milkShort) {
    reasons.push("milk_short");
  }
  const emptyTooLong =
    state === "milking" &&
    daysSinceCalving !== null &&
    openDays <= daysSinceCalving;
  if (!inCalf && (state === "dry" || emptyTooLong)) {
    reasons.push("open_long");
  }
  if (repeatBreeder) {
    reasons.push("repeat_breeder");
  }
  return reasons;
};
