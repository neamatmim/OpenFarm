/**
 * The arithmetic of closing a Venture out. Here in the domain rather than in the API, because the sum an
 * Investor is shown on a statement and the sum the farm pays out have to be the same sum.
 */

/**
 * The months from one to another, both included, as "YYYY-MM". A Venture is asked about every month it
 * ran for, and a month nobody looked at is as much of a gap as one that disagreed.
 */
export const monthsFromTo = (from: string, to: string): string[] => {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  while (`${year}-${String(month).padStart(2, "0")}` <= to) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
};

/** The month before this day's month, which is the last month that is certainly over. */
export const monthBefore = (day: string): string => {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
};

/** What a Venture's Agreements froze, and what its animals came to. */
export interface ToSplit {
  /** What its Animals fetched, less everything it was charged. Negative when the run lost money. */
  profitBdt: number;
  /** The share of profit the Investors take, as their Agreements froze it. */
  investorsPercent: number;
  /** Every Unit signed for across those Agreements. */
  units: number;
}

/** How a Venture's profit divides: the Investors' share, what one Unit takes of it, and the Farm's. */
export interface Split {
  investorsBdt: number;
  /** Whole taka, floored: nothing is paid out that the account does not hold. */
  perUnitBdt: number;
  /** What flooring left over, which goes to the Farm rather than to nobody. */
  roundingBdt: number;
  farmBdt: number;
}

/**
 * The split by the percentages the Agreements froze, divided by Units held.
 *
 * Floored to whole taka per Unit, because paying out a figure the account cannot hold to the paisa is how
 * a payout goes one taka over what came in; what the flooring leaves over is the Farm's, and shown as its
 * own line rather than quietly kept. A loss divides the same way and comes off capital by Units held.
 */
export const splitOfProfit = ({
  profitBdt,
  investorsPercent,
  units,
}: ToSplit): Split => {
  const investorsBdt = Math.round((profitBdt * investorsPercent) / 100);
  const perUnitBdt = units === 0 ? 0 : Math.floor(investorsBdt / units);
  const roundingBdt = investorsBdt - perUnitBdt * units;
  return {
    investorsBdt,
    perUnitBdt,
    roundingBdt,
    farmBdt: profitBdt - investorsBdt + roundingBdt,
  };
};

/** What one Investor is paid: the capital they put in, back whole, and what their Units took of the
 *  profit — or lost of it, which comes off the capital they get back. */
export const payoutOf = (
  capitalBdt: number,
  unitsHeld: number,
  perUnitBdt: number
) => capitalBdt + perUnitBdt * unitsHeld;
