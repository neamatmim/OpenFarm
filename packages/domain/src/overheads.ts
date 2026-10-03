import { roundMoney } from "./money";
import type { PenHistoryLine } from "./pen-history";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every day every Animal stood on the farm inside the stretch, added up — a bull here all of a thirty-day month is
 * thirty, one who came on the 16th is fifteen — counted from her Pen history, so a move between Pens is still one
 * animal and a day she was gone is no day at all. Whichever Side she stood on, and whoever owned her.
 */
export const headDaysIn = (
  history: readonly Pick<PenHistoryLine, "from" | "until">[],
  { from, until }: { from: Date; until: Date }
): number => {
  let ms = 0;
  for (const line of history) {
    const start = Math.max(line.from.getTime(), from.getTime());
    const end = Math.min((line.until ?? until).getTime(), until.getTime());
    if (end > start) {
      ms += end - start;
    }
  }
  return ms / DAY_MS;
};

/** Money that went on the place and the people in the stretch: what it was entered under, and how much. */
export interface OverheadMoney {
  categoryId: string;
  categoryBn: string;
  categoryEn: string | null;
  amount: number;
}

/**
 * What running the place cost over a stretch (CONTEXT.md: **Overhead**): all of it, what it was by Category — the
 * largest first, since that is where a farm looks to spend less — and what it comes to a head a day over every day an
 * Animal stood here. Nothing a head a day where nobody stood: a figure over no days is no figure.
 *
 * Beside the animals' own costs, never part of them.
 */
export const overheadsOver = ({
  money,
  headDays,
}: {
  money: readonly OverheadMoney[];
  headDays: number;
}) => {
  const byCategory = new Map<string, OverheadMoney>();
  for (const one of money) {
    const kept = byCategory.get(one.categoryId);
    byCategory.set(one.categoryId, {
      ...one,
      amount: (kept?.amount ?? 0) + one.amount,
    });
  }
  const totalMoney = money.reduce((sum, one) => sum + one.amount, 0);
  return {
    totalMoney: roundMoney(totalMoney),
    lines: [...byCategory.values()]
      .map((one) => ({ ...one, amount: roundMoney(one.amount) }))
      .toSorted(
        (a, b) =>
          b.amount - a.amount ||
          a.categoryBn.localeCompare(b.categoryBn) ||
          a.categoryId.localeCompare(b.categoryId)
      ),
    /** Days, to the tenth: what the figure below is over. */
    headDays: Math.round(headDays * 10) / 10,
    perHeadPerDayMoney: headDays > 0 ? roundMoney(totalMoney / headDays) : null,
  };
};
