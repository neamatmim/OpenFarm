import { roundTaka } from "./money";

/**
 * The arithmetic of closing a Venture out. Here in the domain rather than in the API, because the sum an
 * Investor is shown on a statement and the sum the farm pays out have to be the same sum.
 */

/**
 * What an Animal is worth at a rate: her last weight by the taka a kilo, to the paisa.
 *
 * Said here because both sides strike it — the farm to write the Internal Sale, and the screen to show
 * the Owner what she is committing to before she agrees. The server strikes it again from the weight it
 * holds and refuses a figure that disagrees, so a screen doing its own arithmetic would refuse her over
 * a rounding rather than over a re-weighing, which is the only thing that refusal is for.
 */
export const priceAtWeight = (
  weightKg: number,
  rateMoneyPerKg: number
): number => roundTaka(weightKg * rateMoneyPerKg);

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
  profitMoney: number;
  /** The share of profit the Investors take, as their Agreements froze it. */
  investorsPercent: number;
  /** Every Unit held across those Agreements: what each paid in, over the Unit price. */
  units: number;
  /** Each Agreement's own holding, where they are known, so what each takes is floored on its own. */
  held?: readonly number[];
}

/** How a Venture's profit divides: the Investors' share, what one Unit takes of it, and the Farm's. */
export interface Split {
  investorsMoney: number;
  /** Whole taka, floored: nothing is paid out that the account does not hold. */
  perUnitMoney: number;
  /** What flooring left over, which goes to the Farm rather than to nobody. */
  roundingMoney: number;
  farmMoney: number;
}

/** Units held are kept to four places: enough that no taka of capital goes uncounted, few enough to print. */
const HELD_PLACES = 10_000;

/**
 * The Units an Agreement holds: the capital it paid in, over the Unit price — a fraction where it paid part of a Unit.
 * A Venture may start buying while an Agreement is part paid, and the share of a profit or a loss divides by these,
 * never by the Units signed for, or he takes a share of the run for money he never put in and every taka that was put
 * in is diluted by it. Paid in full, they are the Units he signed for.
 */
export const unitsHeld = (capitalMoney: number, unitPriceMoney: number) =>
  unitPriceMoney > 0
    ? Math.round((capitalMoney / unitPriceMoney) * HELD_PLACES) / HELD_PLACES
    : 0;

/** Holdings added up, to the same four places: 0.1 + 0.2 Units is 0.3 of them, not a hair over. */
export const unitsAltogether = (held: readonly number[]) =>
  Math.round(held.reduce((sum, one) => sum + one, 0) * HELD_PLACES) /
  HELD_PLACES;

/**
 * What a holding takes of a figure per Unit, floored to whole taka like the figure per Unit itself: a holding of whole
 * Units takes exactly so many of it, and a part of a Unit never takes a paisa the account does not hold. Worked to the
 * four places Units are held to first, so 3,750 × 9.6 is 36,000 and not a taka under it.
 */
export const whatUnitsTake = (perUnitMoney: number, units: number) =>
  Math.floor(Math.round(perUnitMoney * units * HELD_PLACES) / HELD_PLACES);

/**
 * The split by the percentages the Agreements froze, divided by Units held.
 *
 * Floored to whole taka per Unit, because paying out a figure the account cannot hold to the paisa is how
 * a payout goes one taka over what came in; what the flooring leaves over is the Farm's, and shown as its
 * own line rather than quietly kept. A loss divides the same way and comes off capital by Units held.
 */
export const splitOfProfit = ({
  profitMoney,
  investorsPercent,
  units,
  held = [units],
}: ToSplit): Split => {
  const investorsMoney = Math.round((profitMoney * investorsPercent) / 100);
  const perUnitMoney = units === 0 ? 0 : Math.floor(investorsMoney / units);
  // What the holdings take between them, each floored on its own: whole Units take exactly perUnit × Units, and a
  // holding with part of a Unit leaves its paisa here, on the Farm's line, rather than paid out of nothing.
  const takenMoney = held.reduce(
    (sum, one) => sum + whatUnitsTake(perUnitMoney, one),
    0
  );
  const roundingMoney = investorsMoney - takenMoney;
  return {
    investorsMoney,
    perUnitMoney,
    roundingMoney,
    farmMoney: profitMoney - investorsMoney + roundingMoney,
  };
};

/** What one Investor is paid: the capital they put in, back whole, and what their Units took of the
 *  profit — or lost of it, which comes off the capital they get back. */
export const payoutOf = (
  capitalMoney: number,
  units: number,
  perUnitMoney: number
) => capitalMoney + whatUnitsTake(perUnitMoney, units);
