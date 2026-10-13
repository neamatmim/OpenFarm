import type { Side, WageRunRow } from "@OpenFarm/domain";

import type { EnterMoneyStart } from "@/components/money-entry";
import { figureOf } from "@/lib/typed-figure";

/** What the sheet holds: who is ticked, and the wage typed for anybody whose is not last month's. */
export interface WageRunTyped {
  ticked: ReadonlySet<string>;
  /** By person: the wage as typed, where the box was touched at all — an emptied box is "", which pays nothing. */
  typed: Readonly<Record<string, string>>;
}

/**
 * The wage a row stands at: last month's where its box was never touched, or what was typed — Bangla digits and all —
 * where it was. An emptied box is nothing typed yet, and pays nothing: never last month's wage put back unseen.
 */
const wageOf = (row: WageRunRow, typed: string | undefined): number => {
  if (typed === undefined) {
    return row.wageMoney;
  }
  const figure = figureOf(typed);
  return figure !== null && Number.isFinite(figure) ? figure : 0;
};

/**
 * The month's wages as the sheet sends them: each ticked person not already paid, at the wage typed or last month's,
 * on the Side last month's fell to, and nobody whose wage is nothing — a wage of nothing is not a wage.
 */
export const wagesToSend = (
  rows: readonly WageRunRow[],
  { ticked, typed }: WageRunTyped
): { personId: string; amountMoney: number; side?: Side }[] =>
  rows.flatMap((row) => {
    const amountMoney = wageOf(row, typed[row.personId]);
    return ticked.has(row.personId) && !row.paid && amountMoney > 0
      ? [
          {
            personId: row.personId,
            amountMoney,
            ...(row.side ? { side: row.side } : {}),
          },
        ]
      : [];
  });

/**
 * What payday takes off the person's draws still owed at the wage typed — up to the wage, the farm's payday rule — and
 * what stays owed for the next.
 */
export const drawsOffOf = (
  row: WageRunRow,
  typed: string | undefined
): { takenMoney: number; leftMoney: number } => {
  const owed = row.drawsTakenMoney + row.drawsLeftMoney;
  const takenMoney = Math.min(owed, wageOf(row, typed));
  return { takenMoney, leftMoney: owed - takenMoney };
};

/** What changes hands now at the wage typed: what is left of it once the draws come off. */
export const paidNowOf = (row: WageRunRow, typed?: string): number =>
  wageOf(row, typed) - drawsOffOf(row, typed).takenMoney;

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
