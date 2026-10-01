import { monthsFromTo } from "./venture";

/**
 * How a Venture's Investors pay for their Units: the whole price before the buying starts, or the **Cattle Part**
 * before it and the rest in **Monthly Sums** while it runs. Chosen when it opens; every Venture before 2026-10-02 was
 * paid before buying. Mirrored in @OpenFarm/db, which depends on nothing.
 */
export const CAPITAL_PAID = ["before_buying", "by_the_month"] as const;
export type CapitalPaid = (typeof CAPITAL_PAID)[number];

/** The day of the month a Monthly Sum is due, the same for every Venture (the advisers' answers, 2026-10-02). */
export const SUM_DUE_DAY = 10;

/** The days after its due day a Monthly Sum may come before it is missed. A missed sum may still be paid until the
 *  selling starts, and then counts like any other taka; nothing is ever charged for its being late. */
export const SUM_MISSED_AFTER_DAYS = 7;

/** What a Venture paid by the month freezes when it opens. */
export interface MonthlyTerms {
  /** What one Unit pays before the buying starts: its share of the Cattle Budget. */
  cattlePartBdt: number;
  /** How many Monthly Sums there are. */
  sums: number;
  /** The day the first falls due, "YYYY-MM-DD"; each after it on the same day of the next month. */
  firstDueOn: string;
}

/** Why a Venture cannot be paid by the month. */
export type NoMonthlyTerms =
  /** No due day falls after the month it is decided in and before its Target Window opens. */
  | "no_month_to_pay_in"
  /** Its Cattle Budget is all its capital: there is nothing left to pay by the month. */
  | "nothing_to_pay_monthly";

const dueIn = (month: string) =>
  `${month}-${String(SUM_DUE_DAY).padStart(2, "0")}`;

/** The month after this day's month, "YYYY-MM". */
const monthAfter = (day: string): string => {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
};

/**
 * The terms a Venture paid by the month opens on, worked from its own figures so that nobody types them and they cannot
 * disagree with its budgets.
 *
 * - The Cattle Part is the Unit price in the proportion its Cattle Budget is of its capital — the same proportion the
 *   capital itself is planned in — to the whole taka.
 * - A Monthly Sum falls due on the 10th of every month after the month of its decision date, while that 10th is before
 *   its Target Window opens. Both days are set when it opens, so an Investor knows the whole schedule before he signs;
 *   the day buying actually starts is not known then.
 */
export const monthlyTermsOf = (venture: {
  unitPriceBdt: number;
  targetCapitalBdt: number;
  cattleBudgetBdt: number;
  decideBy: string;
  targetWindowStart: string;
}): MonthlyTerms | NoMonthlyTerms => {
  const cattlePartBdt =
    venture.targetCapitalBdt > 0
      ? Math.round(
          (venture.unitPriceBdt * venture.cattleBudgetBdt) /
            venture.targetCapitalBdt
        )
      : venture.unitPriceBdt;
  if (cattlePartBdt >= venture.unitPriceBdt) {
    return "nothing_to_pay_monthly";
  }
  const first = monthAfter(venture.decideBy);
  const due = monthsFromTo(first, venture.targetWindowStart.slice(0, 7))
    .map(dueIn)
    .filter((day) => day < venture.targetWindowStart);
  const [firstDueOn] = due;
  if (firstDueOn === undefined) {
    return "no_month_to_pay_in";
  }
  return { cattlePartBdt, sums: due.length, firstDueOn };
};

/** One Monthly Sum of one Unit: the day it falls due and what it is. */
export interface MonthlySum {
  dueOn: string;
  bdt: number;
}

/**
 * A Unit's Monthly Sums as its frozen terms make them: what is left of the Unit price after its Cattle Part, divided
 * into whole taka, the last taking whatever the division left over so they add up to the price to the taka.
 */
export const monthlySumsOf = (
  unitPriceBdt: number,
  terms: MonthlyTerms
): MonthlySum[] => {
  const restBdt = unitPriceBdt - terms.cattlePartBdt;
  const eachBdt = Math.floor(restBdt / terms.sums);
  const lastBdt = restBdt - eachBdt * (terms.sums - 1);
  const firstMonth = terms.firstDueOn.slice(0, 7);
  const months: string[] = [firstMonth];
  while (months.length < terms.sums) {
    months.push(monthAfter(`${months.at(-1)}-01`));
  }
  return months.map((month, at) => ({
    dueOn: `${month}-${terms.firstDueOn.slice(8, 10)}`,
    bdt: at === terms.sums - 1 ? lastBdt : eachBdt,
  }));
};
