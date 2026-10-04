import type { Language } from "./languages";

/** How a sentence counts in a currency: one of it ("every taka", "every dollar"), a sum of it after its figure ("২০০
 *  টাকা", "200 dollars"), and in Bangla the two endings a sentence puts on it — of it (টাকার, ডলারের) and in it
 *  (টাকায়, ডলারে), which a word ending in a vowel and one ending in a consonant take differently. */
interface CurrencyWords {
  one: string;
  sum: string;
  of: string;
  in: string;
}

/**
 * The currencies a farm may count its money in, by ISO 4217 code: the sign written before a sum, and the words a
 * sentence says it in, in each language. A farm counts in one, chosen when its server is set up (ADR 0013); another
 * country is one more entry here.
 */
export const CURRENCIES = {
  BDT: {
    sign: "৳",
    words: {
      bn: { one: "টাকা", sum: "টাকা", of: "টাকার", in: "টাকায়" },
      en: { one: "taka", sum: "taka", of: "taka", in: "taka" },
    },
  },
  USD: {
    sign: "$",
    words: {
      bn: { one: "ডলার", sum: "ডলার", of: "ডলারের", in: "ডলারে" },
      en: { one: "dollar", sum: "dollars", of: "dollars", in: "dollars" },
    },
  },
} as const satisfies Record<
  string,
  { sign: string; words: Record<Language, CurrencyWords> }
>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const isCurrencyCode = (code: string): code is CurrencyCode =>
  Object.hasOwn(CURRENCIES, code);

/**
 * Where the farm is, as far as reading its figures goes: the currency its money is counted in, the IANA time zone its
 * own day and clock are read on, the ISO 3166 country a phone number written without its country code is read in, and
 * the month its financial year begins in. One for the whole server, fixed when it is set up — a farm that changed one
 * would read every sum, every day, every number or every year it already kept differently.
 */
export interface FarmLocale {
  currency: CurrencyCode;
  timeZone: string;
  country: string;
  /** The month its financial year begins in, 1 for January to 12 for December: 7 in Bangladesh, whose income year
   *  runs from July to June. */
  yearStarts: number;
}

/** Where OpenFarm was first built: a farm in Bangladesh. */
export const DEFAULT_FARM_LOCALE: FarmLocale = {
  currency: "BDT",
  timeZone: "Asia/Dhaka",
  country: "BD",
  yearStarts: 7,
};

/** Whether a figure is a month a financial year can begin in: a whole number from 1 to 12. */
export const isYearStart = (month: number): boolean =>
  Number.isInteger(month) && month >= 1 && month <= 12;

let current: FarmLocale = DEFAULT_FARM_LOCALE;

/** Whether the browser and the server both know the zone, so a farm day read on either is the same day. */
export const isTimeZone = (zone: string): boolean => {
  try {
    const known = new Intl.DateTimeFormat("en", { timeZone: zone });
    return known.resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
};

const TWO_LETTERS = /^[A-Z]{2}$/u;

/** Whether a code is a country this runtime can name: two capitals it knows, not one it hands back unread. */
export const isCountry = (code: string): boolean => {
  if (!TWO_LETTERS.test(code)) {
    return false;
  }
  try {
    return new Intl.DisplayNames("en", { type: "region" }).of(code) !== code;
  } catch {
    return false;
  }
};

/**
 * Set once, as the server starts and as the page opens in the browser, before anything is read or written out. A zone
 * neither knows is refused rather than read as UTC, which would move every farm day without a word.
 */
export const setFarmLocale = (locale: FarmLocale): void => {
  if (!isCurrencyCode(locale.currency)) {
    throw new Error(`OpenFarm does not count money in ${locale.currency}`);
  }
  if (!isTimeZone(locale.timeZone)) {
    throw new Error(`${locale.timeZone} is not a time zone this runtime knows`);
  }
  if (!isCountry(locale.country)) {
    throw new Error(`${locale.country} is not a country this runtime knows`);
  }
  if (!isYearStart(locale.yearStarts)) {
    throw new Error(`${locale.yearStarts} is not a month a year can begin in`);
  }
  current = {
    currency: locale.currency,
    timeZone: locale.timeZone,
    country: locale.country,
    yearStarts: locale.yearStarts,
  };
};

export const farmLocale = (): FarmLocale => current;

export const farmTimeZone = (): string => current.timeZone;

/** The month the farm's financial year begins in: 7, July, for a farm in Bangladesh. */
export const farmYearStarts = (): number => current.yearStarts;

/** The country a phone number written without its country code is read in: BD for a farm in Bangladesh. */
export const farmCountry = (): string => current.country;

/** The farm's country as a sentence names it, in a language: বাংলাদেশ, Bangladesh. */
export const farmCountryName = (language: Language): string =>
  new Intl.DisplayNames(language, { type: "region" }).of(current.country) ??
  current.country;

/** The sign the farm's money is written with: ৳ for taka. */
export const currencySign = (): string => CURRENCIES[current.currency].sign;

/** The words a sentence counts the farm's money in, in a language. */
export const currencyWords = (language: Language): CurrencyWords =>
  CURRENCIES[current.currency].words[language];
