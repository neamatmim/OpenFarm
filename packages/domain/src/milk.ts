import { farmDayOf, farmDaysApart } from "./farm-clock";

/** Where a cow's milk went. Bulk is the tank the processor collects; Calves is what stays
 *  on the farm; Discard is poured away — the only lawful destination under Withdrawal. */
export const MILK_DESTINATIONS = ["bulk", "calves", "discard"] as const;
export type MilkDestination = (typeof MILK_DESTINATIONS)[number];

const PERCENT = 100;
/** Litres are kept to two decimals, and the column they live in keeps the same. One scale,
 *  used for both the arithmetic and the value written, so the two cannot drift apart. */
export const LITRE_DECIMALS = 2;
const LITRE_SCALE = 10 ** LITRE_DECIMALS;

const toScale = (value: number): number =>
  Math.round(value * LITRE_SCALE) / LITRE_SCALE;

/** Litres as the record keeps them — the one rounding, shared by the arithmetic here and by
 *  the value written to the column, so the two cannot drift apart. */
export const roundLitres = toScale;
/** Percentages are reported to the same two decimals. */
const roundPercent = toScale;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Is this cow's milk inside a Withdrawal right now? The date comes from the last Treatment
 *  given, on the product's own days. She comes off at the instant it names: milk drawn at that
 *  instant may go to the tank, and a moment before it may not. */
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
  const differenceLitres = roundLitres(bulkLitres - sumBulkLitres);
  // With nothing recorded for the tank there is no percentage to take: milk in it at all is
  // entirely unaccounted for, and none at all is nothing to flag.
  let differencePercent = PERCENT;
  if (sumBulkLitres > 0) {
    differencePercent = roundPercent(
      (Math.abs(differenceLitres) / sumBulkLitres) * PERCENT
    );
  } else if (differenceLitres === 0) {
    differencePercent = 0;
  }
  return {
    sumBulkLitres: roundLitres(sumBulkLitres),
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

export interface LactationView {
  lactationNumber: number;
  lactationStartedAt: Date | null;
  /** Null unless she is in milk right now. */
  daysInMilk: number | null;
}

/** Everything about a cow's Lactation that is derived rather than stored, in one place, so
 *  every screen that shows it shows the same thing. What is holding her back is
 *  `withdrawalView`'s business, not this one's — a Withdrawal is not part of a lactation. */
export const lactationView = (
  animal: {
    state: string;
    lactationNumber: number;
    lactationStartedAt: Date | null;
  },
  now: Date
): LactationView => ({
  lactationNumber: animal.lactationNumber,
  lactationStartedAt: animal.lactationStartedAt,
  daysInMilk:
    animal.state === "milking"
      ? daysInMilk(animal.lactationStartedAt, now)
      : null,
});

/**
 * What a set of Milk Records sent to one Destination, in the litres the record keeps.
 *
 * Summed here rather than at each screen, so the Owner's tile and the Manager's report
 * cannot disagree about what reached the tank — and so "to Bulk" means the same thing
 * everywhere it is asked.
 */
export const litresTo = (
  destination: MilkDestination,
  records: readonly { litres: string | number; destination: string }[]
): number =>
  roundLitres(
    records
      .filter((record) => record.destination === destination)
      .reduce((total, record) => total + Number(record.litres), 0)
  );

/** The days a cow's usual milk is read over, before the days her drop is read over. A week of her own. */
export const MILK_USUAL_DAYS = 7;

/** A cow giving less than her own usual, as the list names her: per milking, lately and usually. */
export interface MilkDrop {
  /** Litres per recorded milking in the last few days. */
  lately: number;
  /** Litres per recorded milking over the week before. */
  usually: number;
  /** How far under her usual, as a whole percent. */
  dropPercent: number;
}

/** The mean of some litres. */
const mean = (values: readonly number[]): number => {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
};

/**
 * Whether a cow is giving well under her own recent milk: her litres per recorded milking over the last few farm days
 * before today, every destination — milk thrown away under a Withdrawal is still what she gave — against the week of
 * farm days before those. By farm day, so a morning milking is the day it is milked on whatever the clock says. Per
 * milking, so a milking nobody recorded is not a milking of nothing. A convention, not a measured line
 * (docs/research/cow-watch.md): it catches sudden illness — acute mastitis, milk fever, ketosis — and misses what builds
 * slowly; a heat drops milk too. Nothing until she has a milking in each part, or when she is giving what she usually
 * does. Today is left out: it is not over.
 */
export const milkDropOf = (
  records: readonly { at: Date; litres: number }[],
  now: Date,
  farm: { milkDropPercent: number; milkDropDays: number }
): MilkDrop | null => {
  const today = farmDayOf(now);
  const recent: number[] = [];
  const usual: number[] = [];
  for (const one of records) {
    const back = farmDaysApart(farmDayOf(one.at), today);
    if (back >= 1 && back <= farm.milkDropDays) {
      recent.push(one.litres);
    } else if (
      back > farm.milkDropDays &&
      back <= farm.milkDropDays + MILK_USUAL_DAYS
    ) {
      usual.push(one.litres);
    }
  }
  if (recent.length === 0 || usual.length === 0) {
    return null;
  }
  const lately = mean(recent);
  const usually = mean(usual);
  if (usually <= 0) {
    return null;
  }
  const dropPercent = Math.round((1 - lately / usually) * 100);
  return dropPercent >= farm.milkDropPercent
    ? {
        lately: Math.round(lately * 10) / 10,
        usually: Math.round(usually * 10) / 10,
        dropPercent,
      }
    : null;
};

/** The days the milk into the tank is set against the milk out of the gate. A week. */
export const MILK_ACCOUNT_DAYS = 7;

/** The week's milk, as the farm can account for it: in, out, still in the tank, and what is left over. */
export interface MilkAccount {
  /** What was in the tank when the week began: milked since the last Dispatch before it. */
  carriedIn: number;
  /** What the cows sent to Bulk in the week. */
  toBulk: number;
  /** What left the gate in the week. */
  dispatched: number;
  /** What is in the tank now: milked since the last Dispatch. */
  stillInTank: number;
  /** In, less out, less still in the tank: milk nobody can say what became of. Below nothing when more left than the
   *  records put in, which is shown but never the farm's worry. */
  notAccounted: number;
  /** `notAccounted` as a part of everything that went in, as a whole percent. */
  notAccountedPercent: number;
}

/**
 * The week's milk: what the cows sent to Bulk, against what Dispatches took out of the gate, allowing for what was in
 * the tank when the week began and is in it now — an evening's milk collected the next morning is in the tank one day
 * and out of the gate the next. Whatever is left is milk nobody can account for. Pure: the caller hands it the Sessions'
 * to-Bulk litres and the Dispatches from a little before the week, so the tank at its start can be read.
 */
export const milkAccountOf = (
  sessions: readonly { at: Date; toBulk: number }[],
  dispatches: readonly { at: Date; litres: number }[],
  weekFrom: Date,
  now: Date
): MilkAccount => {
  const lastDispatchBefore = (moment: Date): Date | null => {
    let latest: Date | null = null;
    for (const one of dispatches) {
      if (one.at < moment && (!latest || one.at > latest)) {
        latest = one.at;
      }
    }
    return latest;
  };
  const toBulkBetween = (from: Date | null, until: Date) => {
    let sum = 0;
    for (const one of sessions) {
      if ((!from || one.at > from) && one.at < until) {
        sum += one.toBulk;
      }
    }
    return sum;
  };
  const openedAt = lastDispatchBefore(weekFrom);
  const carriedIn = openedAt ? toBulkBetween(openedAt, weekFrom) : 0;
  let toBulk = 0;
  for (const one of sessions) {
    if (one.at >= weekFrom && one.at < now) {
      toBulk += one.toBulk;
    }
  }
  let dispatched = 0;
  for (const one of dispatches) {
    if (one.at >= weekFrom && one.at < now) {
      dispatched += one.litres;
    }
  }
  const lastOut = lastDispatchBefore(now);
  const stillInTank =
    lastOut && lastOut >= weekFrom
      ? toBulkBetween(lastOut, now)
      : carriedIn + toBulk;
  const notAccounted = carriedIn + toBulk - dispatched - stillInTank;
  const wentIn = carriedIn + toBulk;
  return {
    carriedIn: roundLitres(carriedIn),
    toBulk: roundLitres(toBulk),
    dispatched: roundLitres(dispatched),
    stillInTank: roundLitres(stillInTank),
    notAccounted: roundLitres(notAccounted),
    notAccountedPercent:
      wentIn > 0 ? Math.round((notAccounted / wentIn) * 100) : 0,
  };
};
