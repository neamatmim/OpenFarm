import { farmYearStarts } from "@OpenFarm/i18n";

import { monthAt, monthIndexOf } from "./costs";

// The farm's financial year (ADR 0016): twelve months from the month its server says the year begins in — July for a
// farm in Bangladesh, whose income year runs from July to June. A year is named by the calendar year it begins in, so
// 2025 is July 2025 to June 2026, and on a farm whose year begins in January it is simply 2025.

/** The financial year a farm day or a "YYYY-MM" month falls in, by the calendar year it begins in. */
export const financialYearOf = (monthOrDay: string): number => {
  const year = Number(monthOrDay.slice(0, 4));
  const month = Number(monthOrDay.slice(5, 7));
  return month >= farmYearStarts() ? year : year - 1;
};

/** A financial year's twelve months, oldest first, as "YYYY-MM". */
export const monthsOfFinancialYear = (year: number): string[] => {
  const first = year * 12 + farmYearStarts() - 1;
  return Array.from({ length: 12 }, (_, index) => monthAt(first + index));
};

/** The last day of a "YYYY-MM" month, as a farm day. */
const lastDayOf = (month: string): string => {
  const days = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  ).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
};

/** A financial year's first and last farm days: 2025 is 2025-07-01 to 2026-06-30 for a farm in Bangladesh. */
export const daysOfFinancialYear = (
  year: number
): { from: string; to: string } => {
  const months = monthsOfFinancialYear(year);
  return {
    from: `${months[0]}-01`,
    to: lastDayOf(months.at(-1) ?? ""),
  };
};

/** Whether a financial year begins in one calendar year and ends in the next, and so is named by both: 2025–26. */
export const financialYearSpansTwo = (): boolean => farmYearStarts() !== 1;

/** Whether a "YYYY-MM" month has begun by a farm day: this month and every one before it. */
export const monthHasBegun = (month: string, today: string): boolean =>
  monthIndexOf(month) <= monthIndexOf(today);
