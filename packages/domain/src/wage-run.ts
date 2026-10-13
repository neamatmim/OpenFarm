import type { Side } from "./lifecycle";
import { roundMoney } from "./money";

/** One person's line in a month's wages: last month's wage, the draws it will take, and what is paid now. */
export interface WageRunRow {
  personId: string;
  name: string;
  /** Last month's wage, whole: what they were paid and the draws it took. */
  wageMoney: number;
  side: Side | null;
  /** What payday takes off their draws still owed, the oldest first, up to the wage (CONTEXT.md: **Wage Draw**). */
  drawsTakenMoney: number;
  /** Their draws the wage does not reach, which stay owed and come off the next. */
  drawsLeftMoney: number;
  /** What changes hands now. */
  paidNowMoney: number;
  /** Their wage for this month is entered already, so it is not entered twice. */
  paid: boolean;
}

/**
 * A month's wages, offered all at once: everybody paid a wage last month, at last month's wage, with what payday takes
 * off their draws — the same rule a single wage keeps. An offer to tick and put right, never money owed: somebody who
 * has left is simply not ticked.
 */
export const wageRunOf = ({
  lastMonth,
  openDraws,
  paidThisMonth,
}: {
  lastMonth: readonly {
    personId: string;
    name: string;
    wageMoney: number;
    side: Side | null;
  }[];
  openDraws: readonly { personId: string; openMoney: number }[];
  paidThisMonth: readonly string[];
}): WageRunRow[] => {
  const owedBy = new Map<string, number>();
  for (const draw of openDraws) {
    owedBy.set(
      draw.personId,
      roundMoney((owedBy.get(draw.personId) ?? 0) + draw.openMoney)
    );
  }
  const paid = new Set(paidThisMonth);
  return lastMonth
    .map((one) => {
      const owed = owedBy.get(one.personId) ?? 0;
      const drawsTakenMoney = roundMoney(Math.min(owed, one.wageMoney));
      return {
        personId: one.personId,
        name: one.name,
        wageMoney: one.wageMoney,
        side: one.side,
        drawsTakenMoney,
        drawsLeftMoney: roundMoney(owed - drawsTakenMoney),
        paidNowMoney: roundMoney(one.wageMoney - drawsTakenMoney),
        paid: paid.has(one.personId),
      };
    })
    .toSorted(
      (a, b) =>
        a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId)
    );
};
