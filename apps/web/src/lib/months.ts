import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
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

const MONTHS_A_YEAR = 12;
const A_MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

/** A financial year as the server hands it: its first and last months, "YYYY-MM", and how many months it has. */
interface YearSpan {
  start: string;
  last: string;
  months: number;
}

/**
 * A financial year as the farm names it, in the reader's digits (ADR 0017): by the calendar years it begins and ends
 * in, as a Bangladeshi accountant writes the income year — 2025–26, ২০২৫–২৬ — or one year where it begins and ends in
 * the same one. A year that is not twelve months says its length beside its name, «২০২৭–২৮ (৯ মাস)», so a Transition
 * Year is never read as a full one, and two years that begin in the same calendar year are told apart.
 */
export const financialYearName = (
  year: YearSpan,
  t: (key: MessageKey, params?: MessageParams) => string,
  language: Language
): string => {
  const begins = Number(year.start.slice(0, 4));
  const ends = Number(year.last.slice(0, 4));
  const name =
    begins === ends
      ? formatDigits(begins, language)
      : `${formatDigits(begins, language)}–${formatNumber(
          ends % 100,
          language,
          {
            minimumIntegerDigits: 2,
            useGrouping: false,
          }
        )}`;
  return year.months === MONTHS_A_YEAR
    ? name
    : t("years.oddLength", { name, months: year.months });
};

/** The financial year an address names, by the month it begins in, "YYYY-MM"; nothing for one it does not name. */
export const financialYearNamed = (value: unknown): string | undefined =>
  typeof value === "string" && A_MONTH.test(value) ? value : undefined;

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
