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
