import { farmDayOf } from "./farm-clock";

/** A "YYYY-MM" month as a count of months, so that a January reaches back into the December before it. */
const monthIndexOf = (month: string): number =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

const monthAt = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/** A Category the Owner has marked as paid every month, and since when. */
export interface MonthlyCategory {
  id: string;
  paidMonthlySince: Date;
  retired: boolean;
}

/** Money entered under a Category, in the Farm's purse, waiting for approval or not. */
export interface EnteredUnder {
  categoryId: string;
  occurredAt: Date;
}

/** A wage entered for one person, and the month it paid for. */
export interface WagePaid {
  personId: string;
  name: string;
  /** "YYYY-MM" */
  month: string;
}

/** A **Monthly Cost** with nothing entered under it in a month. */
export interface MonthlyCostNotEntered {
  categoryId: string;
  /** "YYYY-MM" */
  month: string;
}

/** Somebody paid a wage for the month before `month`, and none yet for `month`. */
export interface WageNotEntered {
  personId: string;
  name: string;
  /** "YYYY-MM" */
  month: string;
}

/**
 * What of the farm's month has not been entered yet (CONTEXT.md: **Monthly Cost**).
 *
 * Each Monthly Cost with nothing under it this month, once today has reached the farm's due day, and last month
 * whatever the day — never a month before the Owner marked it, and never one retired. And each person paid a wage for
 * one month and none for the next, once that next month is over and the month after it has reached the due day: a
 * wage pays for a month gone, so September's is looked for in October. Only the one month is asked about, so somebody
 * who has left is named for a month and then drops off on their own.
 *
 * A thing to enter, never money owed: nothing here writes anything.
 */
export const monthlyCostsNotEntered = ({
  today,
  dueDay,
  categories,
  entered,
  wages,
}: {
  /** The farm's own day, "YYYY-MM-DD". */
  today: string;
  dueDay: number;
  categories: readonly MonthlyCategory[];
  entered: readonly EnteredUnder[];
  wages: readonly WagePaid[];
}): { costs: MonthlyCostNotEntered[]; wages: WageNotEntered[] } => {
  const thisMonth = monthIndexOf(today);
  const reachedDueDay = Number(today.slice(8, 10)) >= dueDay;
  const monthsAsked = reachedDueDay
    ? [thisMonth - 1, thisMonth]
    : [thisMonth - 1];

  const enteredIn = new Set(
    entered.map(
      (one) => `${one.categoryId} ${farmDayOf(one.occurredAt).slice(0, 7)}`
    )
  );
  const costs = categories
    .filter((category) => !category.retired)
    .flatMap((category) => {
      const markedIn = monthIndexOf(farmDayOf(category.paidMonthlySince));
      return monthsAsked
        .filter(
          (month) =>
            month >= markedIn &&
            !enteredIn.has(`${category.id} ${monthAt(month)}`)
        )
        .map((month) => ({ categoryId: category.id, month: monthAt(month) }));
    });

  const wageMonth = reachedDueDay ? thisMonth - 1 : thisMonth - 2;
  const paidFor = (month: number) =>
    new Map(
      wages
        .filter((one) => monthIndexOf(one.month) === month)
        .map((one) => [one.personId, one])
    );
  const paidBefore = paidFor(wageMonth - 1);
  const paidThen = paidFor(wageMonth);
  const wagesNotEntered = [...paidBefore.values()]
    .filter((one) => !paidThen.has(one.personId))
    .map((one) => ({
      personId: one.personId,
      name: one.name,
      month: monthAt(wageMonth),
    }))
    .toSorted(
      (a, b) =>
        a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId)
    );

  return { costs, wages: wagesNotEntered };
};
