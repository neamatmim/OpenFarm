import {
  farmDayOf,
  financialYearSpansTwo,
  startOfFarmDay,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatDigits, formatNumber } from "@OpenFarm/i18n";

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

/**
 * A financial year as the farm names it, in the reader's digits: 2025–26 for July 2025 to June 2026, the way a
 * Bangladeshi accountant writes the income year (২০২৫–২৬), or 2025 alone on a farm whose year is the calendar's.
 */
export const saidFinancialYear = (year: number, language: Language): string => {
  const first = formatDigits(year, language);
  if (!financialYearSpansTwo()) {
    return first;
  }
  const next = formatNumber((year + 1) % 100, language, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  return `${first}–${next}`;
};

/** The earliest and latest years an address may name: a typed `?year=1` is the last twelve months, not a refusal. */
const FIRST_YEAR = 2000;
const LAST_YEAR = 9999;

/** The financial year an address names, by the calendar year it began in; nothing for one it does not name. */
export const financialYearNamed = (value: unknown): number | undefined => {
  const year = Number(value);
  const inRange =
    Number.isInteger(year) && year >= FIRST_YEAR && year <= LAST_YEAR;
  return inRange ? year : undefined;
};

/** What a month holds, as far as whether it holds anything. */
interface MonthFigures {
  money: { inMoney: number; outMoney: number };
  dairy: { milkSoldMoney: number; chargedMoney: number; litresToBulk: number };
  fattening: { chargedMoney: number; sold: number };
}

/** Whether anything at all happened in a month: money moved, milk left or went to Bulk, or an animal was charged or sold. */
const holdsAnything = ({ money, dairy, fattening }: MonthFigures): boolean =>
  money.inMoney !== 0 ||
  money.outMoney !== 0 ||
  dairy.milkSoldMoney !== 0 ||
  dairy.chargedMoney !== 0 ||
  dairy.litresToBulk !== 0 ||
  fattening.chargedMoney !== 0 ||
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
