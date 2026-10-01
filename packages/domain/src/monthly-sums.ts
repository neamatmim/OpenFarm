import { addDays } from "./fattening";
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

/**
 * What an Agreement may have paid in by now, all told. Its Units' whole price — except while a Venture paid by the
 * month is still gathering its capital, when it is its Units' Cattle Part and no more: the cattle money comes first,
 * the Monthly Sums after the buying starts, and a taka of them taken early would be counted as money for cattle.
 */
export const capitalItMayHold = (
  units: number,
  venture: {
    state: string;
    capitalPaid: CapitalPaid;
    unitPriceBdt: number;
    cattlePartBdt: number | null;
  }
) =>
  venture.capitalPaid === "by_the_month" &&
  venture.state === "open" &&
  venture.cattlePartBdt !== null
    ? units * venture.cattlePartBdt
    : units * venture.unitPriceBdt;

/**
 * Of what a Venture holds, how much is cattle money. Paid before buying, the capital divides between the two budgets in
 * proportion, as the plan divides it. Paid by the month, the Cattle Part comes first and is all its capital up to
 * every signed Unit's Cattle Part; past that it is Monthly Sums, which keep the animals.
 */
export const cattleMoneyOf = (
  capitalBdt: number,
  venture: {
    capitalPaid: CapitalPaid;
    cattlePartBdt: number | null;
    targetCapitalBdt: number;
    cattleBudgetBdt: number;
  },
  signedUnits: number
) => {
  if (
    venture.capitalPaid === "by_the_month" &&
    venture.cattlePartBdt !== null
  ) {
    return Math.min(capitalBdt, signedUnits * venture.cattlePartBdt);
  }
  return venture.targetCapitalBdt > 0
    ? Math.round(
        (capitalBdt * venture.cattleBudgetBdt) / venture.targetCapitalBdt
      )
    : 0;
};

/** The states a Venture paid by the month takes Monthly Sums in: from the buying until the selling starts, after
 *  which a sum not yet paid is not paid (the advisers' answers, 2026-10-02). Open, it takes the Cattle Part. */
export const TAKES_MONTHLY_SUMS = ["buying", "fattening"] as const;

/** Whether a Venture takes capital today: any Venture while Open; one paid by the month while it runs, until it sells. */
export const takesCapital = (venture: {
  state: string;
  capitalPaid: CapitalPaid;
}) =>
  venture.state === "open" ||
  (venture.capitalPaid === "by_the_month" &&
    TAKES_MONTHLY_SUMS.some((one) => one === venture.state));

/** How one Agreement of a Venture paid by the month stands against its schedule on a day. */
export interface SumsStanding {
  /** What it still owes of its Units' whole price. */
  owedBdt: number;
  /** Of that, what has fallen due by the day and not been paid. */
  dueBdt: number;
  /** Of what is due, what fell due more than SUM_MISSED_AFTER_DAYS before the day: missed. It may still be paid until
   *  the selling starts. */
  missedBdt: number;
  /** The next Monthly Sum not yet due — its day and what his Units pay on it — or nothing once none is left. */
  next: MonthlySum | null;
  /** How many of the Monthly Sums his payments have cleared, whole, oldest first; and how many there are. */
  sumsPaid: number;
  sums: number;
  /** The day the latest missed sum fell due, or nothing while none is missed: what the Owner is told of, once a month. */
  lastMissedOn: string | null;
}

/**
 * Where one Agreement stands against its Monthly Sums on a day. What he paid clears his Cattle Part first and then the
 * sums in their order, so a sum paid late clears the oldest one owed — the way a man paying what he is behind on means
 * it.
 */
export const sumsStandingOf = ({
  units,
  unitPriceBdt,
  monthly,
  paidBdt,
  today,
}: {
  units: number;
  unitPriceBdt: number;
  monthly: { cattlePartBdt: number; sums: readonly MonthlySum[] };
  paidBdt: number;
  /** The farm day, "YYYY-MM-DD". */
  today: string;
}): SumsStanding => {
  const dueBy = (passed: (dueOn: string) => boolean) =>
    units *
    (monthly.cattlePartBdt +
      monthly.sums
        .filter((one) => passed(one.dueOn))
        .reduce((sum, one) => sum + one.bdt, 0));
  const missedBefore = addDays(today, -SUM_MISSED_AFTER_DAYS);
  const upcoming = monthly.sums.find((one) => one.dueOn > today);
  // Each sum is cleared once everything due up to it is paid: the Cattle Part first, then the sums in their order.
  let reached = units * monthly.cattlePartBdt;
  const cleared = monthly.sums.map((one) => {
    reached += units * one.bdt;
    return { dueOn: one.dueOn, cleared: reached <= paidBdt };
  });
  const missed = cleared.filter(
    (one) => !one.cleared && one.dueOn < missedBefore
  );
  return {
    owedBdt: Math.max(0, units * unitPriceBdt - paidBdt),
    dueBdt: Math.max(0, dueBy((dueOn) => dueOn <= today) - paidBdt),
    missedBdt: Math.max(0, dueBy((dueOn) => dueOn < missedBefore) - paidBdt),
    next: upcoming
      ? { dueOn: upcoming.dueOn, bdt: units * upcoming.bdt }
      : null,
    sumsPaid: cleared.filter((one) => one.cleared).length,
    sums: monthly.sums.length,
    lastMissedOn: missed.at(-1)?.dueOn ?? null,
  };
};
