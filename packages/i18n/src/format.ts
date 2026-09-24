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

/**
 * A figure as somebody is typing it, in the digits it is stored in: Bangla numerals become English ones, and what
 * cannot be part of a number — grouping commas, a unit, a second decimal point, a minus anywhere but the front — is
 * dropped. A milker whose phone types ১২.৫ has typed 12.5, not nothing.
 */
export const numberAsTyped = (text: string): string => {
  const digits = text
    .replaceAll(BANGLA_DIGIT, (digit) => String(BANGLA_DIGITS.indexOf(digit)))
    .replaceAll(NOT_OF_A_NUMBER, "");
  const negative = digits.startsWith("-");
  const [whole = "", ...fraction] = digits.replaceAll("-", "").split(".");
  const figure = fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
  return negative ? `-${figure}` : figure;
};

/** The farm's own clock, which is what every date shown to somebody on it is read on. Asia/Dhaka
 *  has no daylight saving; a farm parameter later. */
const FARM_TIME_ZONE = "Asia/Dhaka";

export type DateStyle = "date" | "dateTime" | "monthYear" | "time";

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
};

/** Gregorian dates; Bangla month names and numerals in Bangla. */
export const formatDate = (
  date: Date,
  language: Language,
  style: DateStyle = "date",
  timeZone = FARM_TIME_ZONE
): string =>
  new Intl.DateTimeFormat(LOCALE[language], {
    ...DATE_OPTIONS[style],
    timeZone,
  }).format(date);

/**
 * A date as an `<input type="date">` holds it: the farm's own day in plain digits, never Bangla
 * ones — the field itself is not translated, and a browser reads only this shape.
 */
export const formatDayField = (date: Date, timeZone = FARM_TIME_ZONE): string =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
