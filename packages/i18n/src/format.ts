import { farmTimeZone } from "./farm-locale";
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

/** The Bangla numerals ০–৯, in order, for reading a figure somebody typed on a Bangla keyboard. */
const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const BANGLA_DIGIT = /[০-৯]/gu;
const NOT_OF_A_NUMBER = /[^\d.-]/gu;

/** A time of day in the reader's digits — "০৫:০০" rather than "05:00" for a Bangla reader: a time is digits with a
 *  colon in it, and only the digits change. */
export const timeInDigits = (time: string, language: Language): string =>
  time.replaceAll(/\d/gu, (digit) => formatDigits(Number(digit), language));

/** Text as a Bangla keyboard typed it, with its digits read as 0–9 and everything else left as it was: a code of
 *  letters and digits, say, where a number would drop the letters. */
export const latinDigitsOf = (text: string): string =>
  text.replaceAll(BANGLA_DIGIT, (digit) =>
    String(BANGLA_DIGITS.indexOf(digit))
  );

/**
 * A figure as somebody is typing it, in the digits it is stored in: Bangla numerals become English ones, and what
 * cannot be part of a number — grouping commas, a unit, a second decimal point, a minus anywhere but the front — is
 * dropped. A milker whose phone types ১২.৫ has typed 12.5, not nothing.
 */
export const numberAsTyped = (text: string): string => {
  const digits = latinDigitsOf(text).replaceAll(NOT_OF_A_NUMBER, "");
  const negative = digits.startsWith("-");
  const [whole = "", ...fraction] = digits.replaceAll("-", "").split(".");
  const figure = fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
  return negative ? `-${figure}` : figure;
};

export type DateStyle =
  | "date"
  | "dateTime"
  | "monthYear"
  | "monthShort"
  | "time";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  /** The time alone, for a moment today: on the farm's 24-hour clock, as the date-and-time is. */
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  date: { day: "numeric", month: "long", year: "numeric" },
  dateTime: {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // The farm's clock is a 24-hour one in both languages: Bangla's own format would otherwise end a Bangla sentence
    // on an English "PM".
    hourCycle: "h23",
  },
  monthYear: { month: "long", year: "numeric" },
  /** A month named short, under a chart's bar where a year of them stand side by side. */
  monthShort: { month: "short" },
};

/** Gregorian dates, read on the farm's own clock unless a zone is named; Bangla month names and numerals in
 *  Bangla. */
export const formatDate = (
  date: Date,
  language: Language,
  style: DateStyle = "date",
  timeZone = farmTimeZone()
): string =>
  new Intl.DateTimeFormat(LOCALE[language], {
    ...DATE_OPTIONS[style],
    timeZone,
  }).format(date);

/**
 * A date as an `<input type="date">` holds it: the farm's own day in plain digits, never Bangla
 * ones — the field itself is not translated, and a browser reads only this shape.
 */
export const formatDayField = (date: Date, timeZone = farmTimeZone()): string =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
