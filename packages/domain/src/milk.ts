/** Where a cow's milk went. Bulk is the tank the processor collects; Calves is what stays
 *  on the farm; Discard is poured away — the only lawful destination under Withdrawal. */
export const MILK_DESTINATIONS = ["bulk", "calves", "discard"] as const;
export type MilkDestination = (typeof MILK_DESTINATIONS)[number];

const PERCENT = 100;
/** Litres are kept to two decimals, matching the column; arithmetic rounds to the same. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Is this cow's milk inside a Withdrawal right now? Health (increment 3) sets the date from
 *  the last dose given; until then it is seeded. The boundary is inclusive of the instant
 *  itself: milk drawn at the moment the Withdrawal ends is still held back. */
export const underMilkWithdrawal = (
  animal: { milkWithdrawalUntil: Date | null },
  now: Date
): boolean =>
  animal.milkWithdrawalUntil !== null &&
  animal.milkWithdrawalUntil.getTime() > now.getTime();

/**
 * The Destination a Milk Record actually gets. A cow under Withdrawal goes to Discard
 * whatever the phone asked for — the phone evaluates the gate from its last sync and may be
 * stale, and this is one of the two mistakes the farm cannot afford. `forced` records that
 * the answer was taken out of the person's hands, so the litres can be told apart from milk
 * someone chose to pour away.
 */
export const destinationFor = (
  requested: MilkDestination,
  isUnderWithdrawal: boolean
): { destination: MilkDestination; forced: boolean } => {
  if (isUnderWithdrawal && requested !== "discard") {
    return { destination: "discard", forced: true };
  }
  return { destination: requested, forced: false };
};

export interface Reconciliation {
  /** What the per-cow records destined for Bulk add up to. */
  sumBulkLitres: number;
  /** Tank minus cows. Positive means the tank held more than the cows account for. */
  differenceLitres: number;
  /** The difference as a percentage of what the cows account for. */
  differencePercent: number;
  flagged: boolean;
}

/**
 * The Session's bulk total against the sum of its per-cow Bulk records. A difference beyond
 * the farm's tolerance is flagged for the Manager — it is a typo, a missed cow, or leakage,
 * and all three are worth the same day's attention. Exactly at the tolerance is not flagged.
 */
export const reconcile = (
  bulkLitres: number,
  sumBulkLitres: number,
  tolerancePercent: number
): Reconciliation => {
  const differenceLitres = round2(bulkLitres - sumBulkLitres);
  // With nothing recorded for the tank there is no percentage to take: milk in it at all is
  // entirely unaccounted for, and none at all is nothing to flag.
  let differencePercent = PERCENT;
  if (sumBulkLitres > 0) {
    differencePercent = round2(
      (Math.abs(differenceLitres) / sumBulkLitres) * PERCENT
    );
  } else if (differenceLitres === 0) {
    differencePercent = 0;
  }
  return {
    sumBulkLitres: round2(sumBulkLitres),
    differenceLitres,
    differencePercent,
    flagged: differencePercent > tolerancePercent,
  };
};

/** How long this cow has been in milk. The day she calved is day 0. Null when no Lactation
 *  is running, so a caller shows nothing rather than a misleading zero. */
export const daysInMilk = (
  lactationStartedAt: Date | null,
  now: Date
): number | null => {
  if (!lactationStartedAt) {
    return null;
  }
  const elapsed = now.getTime() - lactationStartedAt.getTime();
  return Math.max(0, Math.floor(elapsed / DAY_MS));
};
