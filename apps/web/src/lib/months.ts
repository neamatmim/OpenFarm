import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";

/**
 * The month before this one, on the farm's own clock: at one in the morning in Dhaka it is still
 * yesterday in UTC, and a farm settling August would otherwise be offered July.
 */
export const lastMonth = (): string => {
  const today = farmDayOf(new Date());
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
};

/**
 * A month as the farm says it: 2026-08 is stored, আগস্ট ২০২৬ is read.
 *
 * Said in one place because two screens say it — the Venture's own bank badge and the line on the page
 * the Owner opens first thing — and a month that reads as a date format on one of them and as words on
 * the other is the same defect twice.
 */
export const saidMonth = (month: string, language: Language): string =>
  formatDate(startOfFarmDay(`${month}-01`), language, "monthYear");

/** What a month holds, as far as whether it holds anything. */
interface MonthFigures {
  money: { inBdt: number; outBdt: number };
  dairy: { milkSoldBdt: number; chargedBdt: number; litresToBulk: number };
  fattening: { chargedBdt: number; sold: number };
}

/** Whether anything at all happened in a month: money moved, milk left or went to Bulk, or an animal was charged or sold. */
const holdsAnything = ({ money, dairy, fattening }: MonthFigures): boolean =>
  money.inBdt !== 0 ||
  money.outBdt !== 0 ||
  dairy.milkSoldBdt !== 0 ||
  dairy.chargedBdt !== 0 ||
  dairy.litresToBulk !== 0 ||
  fattening.chargedBdt !== 0 ||
  fattening.sold !== 0;

/**
 * The months from the first that holds anything, oldest first: a farm in its first year is not shown a row of noughts
 * for each month before it began. A month with nothing in it after that stays, as a month the farm stood still. A farm
 * with nothing yet still has this month.
 */
export const fromTheFirstWithAnything = <Month extends MonthFigures>(
  months: readonly Month[]
): Month[] => {
  const first = months.findIndex(holdsAnything);
  return first === -1 ? months.slice(-1) : months.slice(first);
};
