import type { Language } from "./languages";

const LOCALE: Record<Language, string> = { bn: "bn-BD", en: "en-GB" };

/** Digits in English; Bangla numerals (০–৯) and Bangla grouping in Bangla.
 *  Values are always stored as digits — this is display only. */
export const formatNumber = (
  value: number,
  language: Language,
  options: Intl.NumberFormatOptions = {}
): string => new Intl.NumberFormat(LOCALE[language], options).format(value);

/** Digit-only rendering of an integer (no grouping) — tag numbers, counts on tiles. */
export const formatDigits = (value: number, language: Language): string =>
  formatNumber(value, language, {
    useGrouping: false,
    maximumFractionDigits: 0,
  });

export type DateStyle = "date" | "dateTime" | "monthYear";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "long", year: "numeric" },
  dateTime: {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  monthYear: { month: "long", year: "numeric" },
};

/** Gregorian dates; Bangla month names and numerals in Bangla. */
export const formatDate = (
  date: Date,
  language: Language,
  style: DateStyle = "date",
  timeZone = "Asia/Dhaka"
): string =>
  new Intl.DateTimeFormat(LOCALE[language], {
    ...DATE_OPTIONS[style],
    timeZone,
  }).format(date);
