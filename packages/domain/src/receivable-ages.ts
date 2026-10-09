import { farmDaysApart } from "./farm-clock";
import { roundMoney } from "./money";
import { isReceivableOverdue } from "./receivable";

/** How long a Receivable has been owing, by the days since it left, as an accountant ages a book. */
export const RECEIVABLE_AGES = [
  { age: "0-7", upToDays: 7 },
  { age: "8-15", upToDays: 15 },
  { age: "16-30", upToDays: 30 },
  { age: "31-60", upToDays: 60 },
  { age: "over-60", upToDays: Number.POSITIVE_INFINITY },
] as const;
export type ReceivableAge = (typeof RECEIVABLE_AGES)[number]["age"];

/** What buyers owed at a day's end, by age (CONTEXT.md: **Receivable**; ADR 0023). */
export interface ReceivablesByAge {
  owingMoney: number;
  /** Of it, what was overdue that day: past the day promised, or past the farm's days where none was. */
  overdueMoney: number;
  ages: { age: ReceivableAge; owingMoney: number }[];
}

/** What some Receivables still owe, together. */
const sum = (some: readonly { owingMoney: number }[]) =>
  roundMoney(some.reduce((total, one) => total + one.owingMoney, 0));

/**
 * What buyers still owed at the end of a farm day, grouped by the days since each Sale or Dispatch left — 0–7, 8–15,
 * 16–30, 31–60, over 60 — and how much of it was overdue that day, by the promise the farm chases.
 */
export const receivablesByAge = (
  items: readonly {
    leftOn: string;
    owingMoney: number;
    promisedBy: string | null;
  }[],
  asOf: string,
  receivableDays: number
): ReceivablesByAge => {
  const owing = items.filter((one) => one.owingMoney > 0);
  return {
    owingMoney: sum(owing),
    overdueMoney: sum(
      owing.filter((one) => isReceivableOverdue(one, asOf, receivableDays))
    ),
    ages: RECEIVABLE_AGES.map(({ age, upToDays }, index) => {
      const fromDays =
        index === 0 ? 0 : (RECEIVABLE_AGES[index - 1]?.upToDays ?? 0) + 1;
      return {
        age,
        owingMoney: sum(
          owing.filter((one) => {
            const days = farmDaysApart(one.leftOn, asOf);
            return days >= fromDays && days <= upToDays;
          })
        ),
      };
    }),
  };
};
