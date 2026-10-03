import { roundMoney } from "./money";

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
  amount: number;
  from: Date;
  until: Date;
}

export interface Returned {
  costMoney: number;
  backMoney: number;
  resultMoney: number;
  /** What every hundred taka made, to one place: below nothing for a loss. */
  per100: number;
  /** The days each taka was tied up, on average, weighted by the taka. */
  averageDays: number;
  /**
   * That share scaled simply to a year. Null for a Season, a Venture or an Animal not finished — an estimate is never scaled — and for money
   * tied up fewer days than the Owner's floor, which a few weeks scaled to a year makes a wild figure of.
   */
  perYear: number | null;
}

const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

const daysBetween = (from: Date, until: Date): number =>
  Math.max(0, (until.getTime() - from.getTime()) / DAY_MS);

/**
 * A Season's or a Venture's cattle, or one dairy Animal: everything it cost, each sum from the day it was spent to the
 * day its animal left (today, for one still standing), against what came back. Null where nothing was spent.
 */
export const returnOf = ({
  spent,
  backMoney,
  floorDays,
  finished,
}: {
  spent: readonly Spent[];
  backMoney: number;
  floorDays: number;
  finished: boolean;
}): Returned | null => {
  const costMoney = spent.reduce((sum, one) => sum + one.amount, 0);
  if (costMoney <= 0) {
    return null;
  }
  const moneyDays = spent.reduce(
    (sum, one) => sum + one.amount * daysBetween(one.from, one.until),
    0
  );
  const averageDays = moneyDays / costMoney;
  const resultMoney = backMoney - costMoney;
  const share = (resultMoney / costMoney) * 100;
  // The floor is held against the days as they are shown, whole, so money said to have been out 60 days is never
  // refused a year by a floor of 60 for having been out 59.6.
  const scaled =
    finished && averageDays > 0 && Math.round(averageDays) >= floorDays;
  return {
    costMoney: roundMoney(costMoney),
    backMoney: roundMoney(backMoney),
    resultMoney: roundMoney(resultMoney),
    per100: oneDecimal(share),
    averageDays: Math.round(averageDays),
    perYear: scaled ? oneDecimal((share * DAYS_A_YEAR) / averageDays) : null,
  };
};

/** One Agreement's capital: when it reached the Venture Account and when it was paid back. */
export interface CapitalIn {
  amount: number;
  arrived: Date;
  paidBack: Date;
}

/**
 * What the Investors' capital made: their share of the profit over all of it — the days it waited unspent in the
 * Venture Account too — after the Farm's share. Only ever of a Venture settled, so always finished.
 */
export const returnOnCapitalOf = ({
  capital,
  shareMoney,
  floorDays,
}: {
  capital: readonly CapitalIn[];
  shareMoney: number;
  floorDays: number;
}) => {
  const returned = returnOf({
    spent: capital.map((one) => ({
      amount: one.amount,
      from: one.arrived,
      until: one.paidBack,
    })),
    backMoney: capital.reduce((sum, one) => sum + one.amount, 0) + shareMoney,
    floorDays,
    finished: true,
  });
  if (!returned) {
    return null;
  }
  return {
    capitalMoney: returned.costMoney,
    shareMoney: returned.resultMoney,
    per100: returned.per100,
    averageDays: returned.averageDays,
    perYear: returned.perYear,
  };
};

/** What some money spent came to, together: the taka of every line. */
const costOf = (lines: readonly Spent[]) =>
  lines.reduce((sum, one) => sum + one.amount, 0);

/** What a Season or a Venture still going has in it: what it sold, and what stands at today's price, low and high. */
export interface RunningRange {
  /** What the animals already gone cost: none gone, none. */
  soldCostMoney: number;
  /** What the animals already gone made: a fact. */
  soldResultMoney: number;
  /** What the animals still standing have cost so far. */
  standingCostMoney: number;
  /** What they would fetch today, at the low and the high price a kilo. */
  standingLowMoney: number;
  standingHighMoney: number;
  /** The whole, with the standing ones at the low and at the high price a kilo: an estimate, never put a year. */
  low: Returned;
  high: Returned;
}

/**
 * A Season or a Venture still going, at today's price: what its animals already gone brought back, and what those
 * still standing would fetch today at the low and the high price a kilo, against everything spent so far. A range,
 * because the standing part is an estimate; never put a year, because an estimate is never scaled. Null where nothing
 * could be counted — every animal left out for want of a price or a weight.
 */
export const runningRangeOf = ({
  sold,
  standing,
}: {
  sold: { spent: readonly Spent[]; backMoney: number };
  standing: { spent: readonly Spent[]; lowMoney: number; highMoney: number };
}): RunningRange | null => {
  const spent = [...sold.spent, ...standing.spent];
  const at = (standingMoney: number) =>
    returnOf({
      spent,
      backMoney: sold.backMoney + standingMoney,
      floorDays: 0,
      finished: false,
    });
  const low = at(standing.lowMoney);
  const high = at(standing.highMoney);
  if (!(low && high)) {
    return null;
  }
  return {
    soldCostMoney: roundMoney(costOf(sold.spent)),
    soldResultMoney: roundMoney(sold.backMoney - costOf(sold.spent)),
    standingCostMoney: roundMoney(costOf(standing.spent)),
    standingLowMoney: roundMoney(standing.lowMoney),
    standingHighMoney: roundMoney(standing.highMoney),
    low,
    high,
  };
};
