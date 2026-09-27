import { roundTaka } from "./money";

/**
 * What money put into cattle returned: a **Return on Cost** or a **Return on Capital**, in `CONTEXT.md`'s words.
 *
 * Said as a fact first — what every hundred taka made — then the days the money was tied up, and only then that
 * share scaled to a year. The year is simple, never compounded, because a Season turns once a year and a bank's rate
 * set beside it is simple too; and each taka is weighted by the days it was actually out, from the day it was spent
 * to the day its animal left, because feed bought in May was not tied up since February (money × days, the weighting
 * Shariah practice and Bangladesh Bank's "Total Yearly Product" use).
 */

const DAY_MS = 86_400_000;
const DAYS_A_YEAR = 365;

/** One sum of money put in, the day it went out and the day it came back with its animal. */
export interface Spent {
  bdt: number;
  from: Date;
  until: Date;
}

export interface Returned {
  costBdt: number;
  backBdt: number;
  resultBdt: number;
  /** What every hundred taka made, to one place: below nothing for a loss. */
  per100: number;
  /** The days each taka was tied up, on average, weighted by the taka. */
  averageDays: number;
  /**
   * That share scaled simply to a year. Null for a run not finished — an estimate is never scaled — and for money
   * tied up fewer days than the Owner's floor, which a few weeks scaled to a year makes a wild figure of.
   */
  perYear: number | null;
}

const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

const daysBetween = (from: Date, until: Date): number =>
  Math.max(0, (until.getTime() - from.getTime()) / DAY_MS);

/**
 * The days each taka was tied up, on average, weighted by the taka: every sum from the day it went out to the day it
 * came back. Unrounded, so a return worked from totals frozen elsewhere reads the same year as one worked from its
 * lines. Null where nothing was spent.
 */
export const averageDaysOf = (spent: readonly Spent[]): number | null => {
  const costBdt = spent.reduce((sum, one) => sum + one.bdt, 0);
  if (costBdt <= 0) {
    return null;
  }
  const takaDays = spent.reduce(
    (sum, one) => sum + one.bdt * daysBetween(one.from, one.until),
    0
  );
  return takaDays / costBdt;
};

/**
 * The share, the days and the year, from what went in, what came back and how long it was out on average — for a
 * return whose totals are worked out elsewhere, as a Settlement's are frozen when it is approved. Null where nothing
 * was spent.
 */
export const returnOfTotals = ({
  costBdt,
  backBdt,
  averageDays,
  floorDays,
  finished,
}: {
  costBdt: number;
  backBdt: number;
  averageDays: number;
  floorDays: number;
  finished: boolean;
}): Returned | null => {
  if (costBdt <= 0) {
    return null;
  }
  const resultBdt = backBdt - costBdt;
  const share = (resultBdt / costBdt) * 100;
  const scaled = finished && averageDays > 0 && averageDays >= floorDays;
  return {
    costBdt: roundTaka(costBdt),
    backBdt: roundTaka(backBdt),
    resultBdt: roundTaka(resultBdt),
    per100: oneDecimal(share),
    averageDays: Math.round(averageDays),
    perYear: scaled ? oneDecimal((share * DAYS_A_YEAR) / averageDays) : null,
  };
};

/** The share, the average days and the year, from what went in, what it was out for and what came back. */
const worked = (
  spent: readonly Spent[],
  backBdt: number,
  floorDays: number,
  finished: boolean
): Returned | null => {
  const averageDays = averageDaysOf(spent);
  if (averageDays === null) {
    return null;
  }
  return returnOfTotals({
    costBdt: spent.reduce((sum, one) => sum + one.bdt, 0),
    backBdt,
    averageDays,
    floorDays,
    finished,
  });
};

/**
 * A Season's or a Venture's cattle, or one dairy Animal: everything it cost, each sum from the day it was spent to the
 * day its animal left (today, for one still standing), against what came back. Null where nothing was spent.
 */
export const returnOf = ({
  spent,
  backBdt,
  floorDays,
  finished,
}: {
  spent: readonly Spent[];
  backBdt: number;
  floorDays: number;
  finished: boolean;
}): Returned | null => worked(spent, backBdt, floorDays, finished);

/** One Agreement's capital: when it reached the Venture Account and when it was paid back. */
export interface CapitalIn {
  bdt: number;
  arrived: Date;
  paidBack: Date;
}

/**
 * What the Investors' capital made: their share of the profit over all of it — the days it waited unspent in the
 * Venture Account too — after the Farm's share. Only ever of a Venture settled, so always finished.
 */
export const returnOnCapitalOf = ({
  capital,
  shareBdt,
  floorDays,
}: {
  capital: readonly CapitalIn[];
  shareBdt: number;
  floorDays: number;
}) => {
  const returned = worked(
    capital.map((one) => ({
      bdt: one.bdt,
      from: one.arrived,
      until: one.paidBack,
    })),
    capital.reduce((sum, one) => sum + one.bdt, 0) + shareBdt,
    floorDays,
    true
  );
  if (!returned) {
    return null;
  }
  return {
    capitalBdt: returned.costBdt,
    shareBdt: returned.resultBdt,
    per100: returned.per100,
    averageDays: returned.averageDays,
    perYear: returned.perYear,
  };
};
