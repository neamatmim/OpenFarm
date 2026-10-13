import type { WageRunRow } from "@OpenFarm/domain";

import type { EnterMoneyStart } from "@/components/money-entry";

/** What the sheet holds: who is ticked, and the wage typed for anybody whose is not last month's. */
export interface WageRunTyped {
  ticked: ReadonlySet<string>;
  /** By person: the wage as typed, where it was typed at all. */
  typed: Readonly<Record<string, string>>;
}

/** The wage a row stands at: what was typed, or last month's where nothing was. */
const wageOf = (row: WageRunRow, typed: string | undefined): number =>
  typed === undefined || typed.trim() === "" ? row.wageMoney : Number(typed);

/**
 * The month's wages as the sheet sends them: each ticked person not already paid, at the wage typed or last month's,
 * and nobody whose wage is nothing — a wage of nothing is not a wage.
 */
export const wagesToSend = (
  rows: readonly WageRunRow[],
  { ticked, typed }: WageRunTyped
): { personId: string; amountMoney: number }[] =>
  rows.flatMap((row) => {
    const amountMoney = wageOf(row, typed[row.personId]);
    return ticked.has(row.personId) && !row.paid && amountMoney > 0
      ? [{ personId: row.personId, amountMoney }]
      : [];
  });

/** What changes hands now at the wage typed: the person's draws still owed come off it first, the farm's payday rule. */
export const paidNowOf = (row: WageRunRow, typed: string): number => {
  const owed = row.drawsTakenMoney + row.drawsLeftMoney;
  return Math.max(0, wageOf(row, typed) - owed);
};

/** A Monthly Cost not entered, opened with whom it was paid to and how much last time. */
export const startOfMissingCost = (row: {
  categoryId: string;
  /** Missing from an answer a phone kept from before the farm said it. */
  last?: { counterparty: string | null; amountMoney: number } | null;
}): EnterMoneyStart => ({
  categoryId: row.categoryId,
  ...(row.last?.counterparty ? { counterparty: row.last.counterparty } : {}),
  ...(row.last ? { amount: String(row.last.amountMoney) } : {}),
});

/** A wage not entered, opened with the person, the month and their last wage whole. */
export const startOfMissingWage = (row: {
  categoryId: string | null;
  personName: string;
  month: string;
  /** Missing from an answer a phone kept from before the farm said it. */
  lastWageMoney?: number | null;
}): EnterMoneyStart => ({
  ...(row.categoryId ? { categoryId: row.categoryId } : {}),
  counterparty: row.personName,
  wageMonth: row.month,
  ...(typeof row.lastWageMoney === "number"
    ? { amount: String(row.lastWageMoney) }
    : {}),
});

/** A name as the farm compares it: one Unicode form, any case, trimmed — as it finds a Counterparty by name. */
const compared = (name: string) => name.normalize("NFC").trim().toLowerCase();

/**
 * Whether the person a wage names is somebody the farm has never paid nor has on its list — so a second spelling of
 * somebody it has is said before it splits one person into two. Nothing typed is nobody new.
 */
export const isANewName = (
  typed: string,
  known: readonly string[]
): boolean => {
  const name = compared(typed);
  return name !== "" && !known.some((one) => compared(one) === name);
};
