import { addDays } from "./fattening";
import { roundMoney } from "./money";
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
  cattlePartMoney: number;
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
  unitPriceMoney: number;
  targetCapitalMoney: number;
  cattleBudgetMoney: number;
  decideBy: string;
  targetWindowStart: string;
}): MonthlyTerms | NoMonthlyTerms => {
  const cattlePartMoney =
    venture.targetCapitalMoney > 0
      ? Math.round(
          (venture.unitPriceMoney * venture.cattleBudgetMoney) /
            venture.targetCapitalMoney
        )
      : venture.unitPriceMoney;
  if (cattlePartMoney >= venture.unitPriceMoney) {
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
  return { cattlePartMoney, sums: due.length, firstDueOn };
};

/** One Monthly Sum of one Unit: the day it falls due and what it is. */
export interface MonthlySum {
  dueOn: string;
  amount: number;
}

/**
 * A Unit's Monthly Sums as its frozen terms make them: what is left of the Unit price after its Cattle Part, divided
 * into whole taka, the last taking whatever the division left over so they add up to the price to the taka.
 */
export const monthlySumsOf = (
  unitPriceMoney: number,
  terms: MonthlyTerms
): MonthlySum[] => {
  const restMoney = unitPriceMoney - terms.cattlePartMoney;
  const eachMoney = Math.floor(restMoney / terms.sums);
  const lastMoney = restMoney - eachMoney * (terms.sums - 1);
  const firstMonth = terms.firstDueOn.slice(0, 7);
  const months: string[] = [firstMonth];
  while (months.length < terms.sums) {
    months.push(monthAfter(`${months.at(-1)}-01`));
  }
  return months.map((month, at) => ({
    dueOn: `${month}-${terms.firstDueOn.slice(8, 10)}`,
    amount: at === terms.sums - 1 ? lastMoney : eachMoney,
  }));
};

/** An Agreement may pay its whole signed price early. State and paper checks belong to the receiving door. */
export const capitalItMayHold = (
  units: number,
  venture: {
    unitPriceMoney: number;
    state: string;
    capitalPaid: CapitalPaid;
    cattlePartMoney: number | null;
  }
) => roundMoney(units * venture.unitPriceMoney);

/**
 * Of what a Venture holds, how much is cattle money. Paid before buying, the capital divides between the two budgets in
 * proportion, as the plan divides it. Paid by the month, the Cattle Part comes first and is all its capital up to
 * this Agreement's signed Units' Cattle Part; past that it is Monthly Sums, which keep the animals.
 * Call separately for each Agreement: one person's advance cannot cover another person's missing Cattle Part.
 */
export const cattleMoneyOf = (
  capitalMoney: number,
  venture: {
    capitalPaid: CapitalPaid;
    cattlePartMoney: number | null;
    targetCapitalMoney: number;
    cattleBudgetMoney: number;
  },
  signedUnits: number
) => {
  if (
    venture.capitalPaid === "by_the_month" &&
    venture.cattlePartMoney !== null
  ) {
    return roundMoney(
      Math.min(Math.max(0, capitalMoney), signedUnits * venture.cattlePartMoney)
    );
  }
  return venture.targetCapitalMoney > 0
    ? Math.round(
        (capitalMoney * venture.cattleBudgetMoney) / venture.targetCapitalMoney
      )
    : 0;
};

/** The states a Venture paid by the month takes Monthly Sums in: from the buying until the selling starts, after
 *  which a sum not yet paid is not paid (the advisers' answers, 2026-10-02). Open, it also takes advance Monthly Sums. */
export const TAKES_MONTHLY_SUMS = ["buying", "fattening"] as const;

/** Whether a Venture takes capital today: any Venture while Open; one paid by the month while it runs, until it sells. */
export const takesCapital = (venture: {
  state: string;
  capitalPaid: CapitalPaid;
}) =>
  venture.state === "open" ||
  (venture.capitalPaid === "by_the_month" &&
    TAKES_MONTHLY_SUMS.some((one) => one === venture.state));

/** A confirmed payment's allocation against the original schedule, including partially paid sums. */
export interface MonthlyPaymentAllocation {
  totalMoney: number;
  paidMoney: number;
  owedMoney: number;
  cattleRequiredMoney: number;
  cattlePaidMoney: number;
  monthlyPaidMoney: number;
  /** Confirmed money allocated to sums whose original due dates are still ahead. */
  paidEarlyMoney: number;
  sums: {
    dueOn: string;
    amountMoney: number;
    paidMoney: number;
    leftMoney: number;
  }[];
}

/** Cattle first, then sums oldest first. Early payments change balances, never the signed dates or amounts. */
export const monthlyPaymentAllocationOf = ({
  units,
  unitPriceMoney,
  monthly,
  paidMoney,
  today,
}: {
  units: number;
  unitPriceMoney: number;
  monthly: { cattlePartMoney: number; sums: readonly MonthlySum[] };
  paidMoney: number;
  today: string;
}): MonthlyPaymentAllocation => {
  const totalMoney = roundMoney(units * unitPriceMoney);
  const confirmedMoney = roundMoney(
    Math.min(totalMoney, Math.max(0, paidMoney))
  );
  const cattleRequiredMoney = roundMoney(units * monthly.cattlePartMoney);
  const cattlePaidMoney = Math.min(confirmedMoney, cattleRequiredMoney);
  let remaining = roundMoney(confirmedMoney - cattlePaidMoney);
  const sums = monthly.sums.map((one) => {
    const amountMoney = roundMoney(units * one.amount);
    const paid = Math.min(remaining, amountMoney);
    remaining = roundMoney(remaining - paid);
    return {
      dueOn: one.dueOn,
      amountMoney,
      paidMoney: paid,
      leftMoney: roundMoney(amountMoney - paid),
    };
  });
  return {
    totalMoney,
    paidMoney: confirmedMoney,
    owedMoney: roundMoney(totalMoney - confirmedMoney),
    cattleRequiredMoney,
    cattlePaidMoney,
    monthlyPaidMoney: roundMoney(confirmedMoney - cattlePaidMoney),
    paidEarlyMoney: roundMoney(
      sums.reduce(
        (sum, one) => sum + (one.dueOn > today ? one.paidMoney : 0),
        0
      )
    ),
    sums,
  };
};

/** How one Agreement of a Venture paid by the month stands against its schedule on a day. */
export interface SumsStanding {
  /** What it still owes of its Units' whole price. */
  owedMoney: number;
  /** Of that, what has fallen due by the day and not been paid. */
  dueMoney: number;
  /** Of what is due, what fell due more than SUM_MISSED_AFTER_DAYS before the day: missed. It may still be paid until
   *  the selling starts. */
  missedMoney: number;
  /** The next Monthly Sum not yet due and not yet paid — its day and what of it his Units still pay, all of it unless
   *  some was sent ahead — or nothing once none is left. */
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
  unitPriceMoney,
  monthly,
  paidMoney,
  today,
}: {
  units: number;
  unitPriceMoney: number;
  monthly: { cattlePartMoney: number; sums: readonly MonthlySum[] };
  paidMoney: number;
  /** The farm day, "YYYY-MM-DD". */
  today: string;
}): SumsStanding => {
  const dueBy = (passed: (dueOn: string) => boolean) =>
    units *
    (monthly.cattlePartMoney +
      monthly.sums
        .filter((one) => passed(one.dueOn))
        .reduce((sum, one) => sum + one.amount, 0));
  const missedBefore = addDays(today, -SUM_MISSED_AFTER_DAYS);
  const allocation = monthlyPaymentAllocationOf({
    units,
    unitPriceMoney,
    monthly,
    paidMoney,
    today,
  });
  const cleared = allocation.sums.map((one) => ({
    dueOn: one.dueOn,
    cleared: one.leftMoney === 0,
    left: one.leftMoney,
  }));
  // The next sum still to pay, not merely the next 10th: a sum sent ahead is not asked for again, and one sent in part
  // asks only for the rest.
  const upcoming = cleared.find((one) => one.dueOn > today && !one.cleared);
  const missed = cleared.filter(
    (one) => !one.cleared && one.dueOn < missedBefore
  );
  return {
    owedMoney: roundMoney(Math.max(0, units * unitPriceMoney - paidMoney)),
    dueMoney: roundMoney(
      Math.max(0, dueBy((dueOn) => dueOn <= today) - paidMoney)
    ),
    missedMoney: roundMoney(
      Math.max(0, dueBy((dueOn) => dueOn < missedBefore) - paidMoney)
    ),
    next: upcoming ? { dueOn: upcoming.dueOn, amount: upcoming.left } : null,
    sumsPaid: cleared.filter((one) => one.cleared).length,
    sums: monthly.sums.length,
    lastMissedOn: missed.at(-1)?.dueOn ?? null,
  };
};

/**
 * What a Venture counts against its Floor before it starts buying. Paid before buying, what it holds. Paid by the
 * month, the capital its signed Units are for: the buying waits on every Cattle Part independently of advance Monthly Sums, so a Floor read against the cash would be one a
 * Venture paid by the month could never reach.
 */
export const towardsTheFloor = (venture: {
  capitalPaid: CapitalPaid;
  heldMoney: number;
  signedUnits: number;
  unitPriceMoney: number;
}) =>
  venture.capitalPaid === "by_the_month"
    ? venture.signedUnits * venture.unitPriceMoney
    : venture.heldMoney;
