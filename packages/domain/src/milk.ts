import { farmDayOf, farmDaysApart } from "./farm-clock";

/** Where a cow's milk went. Bulk is the tank the processor collects; Calves is what stays
 *  on the farm; Discard is poured away — the only lawful destination under Withdrawal. */
export const MILK_DESTINATIONS = ["bulk", "calves", "discard"] as const;
export type MilkDestination = (typeof MILK_DESTINATIONS)[number];

const PERCENT = 100;
/** Liters are kept to two decimals, and the column they live in keeps the same. One scale,
 *  used for both the arithmetic and the value written, so the two cannot drift apart. */
export const LITER_DECIMALS = 2;
const LITER_SCALE = 10 ** LITER_DECIMALS;

const toScale = (value: number): number =>
  Math.round(value * LITER_SCALE) / LITER_SCALE;

/** Liters as the record keeps them — the one rounding, shared by the arithmetic here and by
 *  the value written to the column, so the two cannot drift apart. */
export const roundLiters = toScale;
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

/** One dose's hold on her milk: when it was given, and when its days run out. */
export interface MilkHold {
  givenAt: Date;
  until: Date;
}

/**
 * Was her milk held at a moment already past — the milking a phone sends late, or one put right afterwards: inside her
 * Withdrawal, and inside a hold that had begun by then. A dose given after the milking cannot reach back and pour away
 * milk drawn before it. Where none of her doses is on the books to say when a hold began, the hold stands as written:
 * a gate that cannot trace a hold keeps it shut.
 */
export const milkHeldAt = (
  animal: { milkWithdrawalUntil: Date | null },
  holds: readonly MilkHold[],
  at: Date
): boolean => {
  if (!underMilkWithdrawal(animal, at)) {
    return false;
  }
  if (holds.length === 0) {
    return true;
  }
  return holds.some((hold) => hold.givenAt <= at && hold.until > at);
};

/**
 * The Destination a Milk Record actually gets. A cow under Withdrawal goes to Discard
 * whatever the phone asked for — the phone evaluates the gate from its last sync and may be
 * stale, and this is one of the two mistakes the farm cannot afford. `forced` records that
 * the answer was taken out of the person's hands, so the liters can be told apart from milk
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
  sumBulkLiters: number;
  /** Tank minus cows. Positive means the tank held more than the cows account for. */
  differenceLiters: number;
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
  bulkLiters: number,
  sumBulkLiters: number,
  tolerancePercent: number
): Reconciliation => {
  const differenceLiters = roundLiters(bulkLiters - sumBulkLiters);
  // With nothing recorded for the tank there is no percentage to take: milk in it at all is
  // entirely unaccounted for, and none at all is nothing to flag.
  let differencePercent = PERCENT;
  if (sumBulkLiters > 0) {
    differencePercent = roundPercent(
      (Math.abs(differenceLiters) / sumBulkLiters) * PERCENT
    );
  } else if (differenceLiters === 0) {
    differencePercent = 0;
  }
  return {
    sumBulkLiters: roundLiters(sumBulkLiters),
    differenceLiters,
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
 * What a set of Milk Records sent to one Destination, in the liters the record keeps.
 *
 * Summed here rather than at each screen, so the Owner's tile and the Manager's report
 * cannot disagree about what reached the tank — and so "to Bulk" means the same thing
 * everywhere it is asked.
 */
export const litersTo = (
  destination: MilkDestination,
  records: readonly { liters: string | number; destination: string }[]
): number =>
  roundLiters(
    records
      .filter((record) => record.destination === destination)
      .reduce((total, record) => total + Number(record.liters), 0)
  );

/** The days a cow's usual milk is read over, before the days her drop is read over. A week of her own. */
export const MILK_USUAL_DAYS = 7;

/** A cow giving less than her own usual, as the list names her: per milking, lately and usually. */
export interface MilkDrop {
  /** Liters per recorded milking in the last few days. */
  lately: number;
  /** Liters per recorded milking over the week before. */
  usually: number;
  /** How far under her usual, as a whole percent. */
  dropPercent: number;
}

/** The mean of some liters. */
const mean = (values: readonly number[]): number => {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
};

/**
 * Whether a cow is giving well under her own recent milk: her liters per recorded milking over the last few farm days
 * before today, every destination — milk thrown away under a Withdrawal is still what she gave — against the week of
 * farm days before those. By farm day, so a morning milking is the day it is milked on whatever the clock says. Per
 * milking, so a milking nobody recorded is not a milking of nothing. A convention, not a measured line
 * (docs/research/cow-watch.md): it catches sudden illness — acute mastitis, milk fever, ketosis — and misses what builds
 * slowly; a heat drops milk too. Nothing until she has a milking in each part, or when she is giving what she usually
 * does. Today is left out: it is not over.
 */
export const milkDropOf = (
  records: readonly { at: Date; liters: number }[],
  now: Date,
  farm: { milkDropPercent: number; milkDropDays: number }
): MilkDrop | null => {
  const today = farmDayOf(now);
  const recent: number[] = [];
  const usual: number[] = [];
  for (const one of records) {
    const back = farmDaysApart(farmDayOf(one.at), today);
    if (back >= 1 && back <= farm.milkDropDays) {
      recent.push(one.liters);
    } else if (
      back > farm.milkDropDays &&
      back <= farm.milkDropDays + MILK_USUAL_DAYS
    ) {
      usual.push(one.liters);
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

/**
 * What the calves drank a day: the milk fed them over the week's seven whole days before today, over seven. Today's is
 * left out — read at breakfast, a morning's feed spread over a whole day would make the calves look as if they drank
 * less than they do.
 */
export const calvesDrankADay = (
  feeds: readonly { at: Date; toCalves: number }[],
  startOfToday: Date
): number => {
  const from = startOfToday.getTime() - MILK_ACCOUNT_DAYS * DAY_MS;
  let drank = 0;
  for (const one of feeds) {
    if (one.at.getTime() >= from && one.at < startOfToday) {
      drank += one.toCalves;
    }
  }
  return drank / MILK_ACCOUNT_DAYS;
};

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
 * to-Bulk liters and the Dispatches from a little before the week, so the tank at its start can be read.
 */
export const milkAccountOf = (
  sessions: readonly { at: Date; toBulk: number }[],
  dispatches: readonly { at: Date; liters: number }[],
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
      dispatched += one.liters;
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
    carriedIn: roundLiters(carriedIn),
    toBulk: roundLiters(toBulk),
    dispatched: roundLiters(dispatched),
    stillInTank: roundLiters(stillInTank),
    notAccounted: roundLiters(notAccounted),
    // To the two decimals the farm keeps a percentage to: a whole percent rounds 3.4% back onto a 3% line, and the
    // milk past it is never told.
    notAccountedPercent:
      wentIn > 0 ? roundPercent((notAccounted / wentIn) * 100) : 0,
  };
};

/** To a tenth of a liter, as the farm says milk. */
const round1 = (value: number) => Math.round(value * 10) / 10;

/** How many of her latest farm days the week's figure reads: what she is giving now, against the Lactation's mean. */
const LATELY_DAYS = 7;

/** One cow's current Lactation, from what she gave: in all, a day on average, at her best day, and lately. */
export interface LactationSummary {
  liters: number;
  /** Farm days she gave milk on. */
  daysMilked: number;
  /** Liters a day over the days she gave milk on. */
  perDay: number | null;
  /** Her best farm day: what she gave on it, and when. */
  peak: { day: string; liters: number } | null;
  /** Liters a day over her latest week of milkings. */
  latelyPerDay: number | null;
}

/**
 * What one cow gave in her Lactation, a farm day at a time: every milking of a day added, whichever Destination it
 * went to — what she gave, not what reached the tank. Per day over the days she was milked, so a cow bought in milk
 * last week is not read against days nobody milked her here.
 */
export const lactationSummary = (
  records: readonly { liters: string | number; recordedAt: Date }[]
): LactationSummary => {
  const byDay = new Map<string, number>();
  for (const record of records) {
    const day = farmDayOf(record.recordedAt);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(record.liters));
  }
  const days = [...byDay].toSorted(([a], [b]) => a.localeCompare(b));
  const liters = days.reduce((sum, [, given]) => sum + given, 0);
  let peak: [string, number] | null = null;
  for (const one of days) {
    if (peak === null || one[1] > peak[1]) {
      peak = one;
    }
  }
  const lately = days.slice(-LATELY_DAYS);
  return {
    liters: round1(liters),
    daysMilked: days.length,
    perDay: days.length === 0 ? null : round1(liters / days.length),
    peak: peak ? { day: peak[0], liters: round1(peak[1]) } : null,
    latelyPerDay:
      lately.length === 0
        ? null
        : round1(
            lately.reduce((sum, [, given]) => sum + given, 0) / lately.length
          ),
  };
};

/**
 * Liters to Bulk for each cow milked, a day: a stretch's Bulk liters from the Dairy side over the cow-days they came
 * from — each cow on each farm day she sent any. What the herd gives a cow, apart from how many cows it has; the tank's
 * total alone rises with every heifer that calves.
 */
export const litersPerCowMilked = (
  shares: readonly {
    animalId: string;
    side: string;
    at: Date;
    liters: number;
  }[],
  { from, until }: { from: Date; until: Date }
): number | null => {
  const cowDays = new Set<string>();
  let liters = 0;
  for (const share of shares) {
    if (share.side === "dairy" && share.at >= from && share.at < until) {
      cowDays.add(`${share.animalId}:${farmDayOf(share.at)}`);
      liters += share.liters;
    }
  }
  return cowDays.size === 0
    ? null
    : Math.round((liters / cowDays.size) * 10) / 10;
};
