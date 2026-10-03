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
 * Where the farm is, as far as reading its figures goes: the currency its money is counted in, and the IANA time zone
 * its own day and clock are read on. One for the whole server, fixed when it is set up — a farm that changed either
 * would read every sum and every day it already kept differently.
 */
export interface FarmLocale {
  currency: CurrencyCode;
  timeZone: string;
}

/** Where OpenFarm was first built: a farm in Bangladesh. */
export const DEFAULT_FARM_LOCALE: FarmLocale = {
  currency: "BDT",
  timeZone: "Asia/Dhaka",
};

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
  current = { currency: locale.currency, timeZone: locale.timeZone };
};

export const farmLocale = (): FarmLocale => current;

export const farmTimeZone = (): string => current.timeZone;

/** The sign the farm's money is written with: ৳ for taka. */
export const currencySign = (): string => CURRENCIES[current.currency].sign;

/** The words a sentence counts the farm's money in, in a language. */
export const currencyWords = (language: Language): CurrencyWords =>
  CURRENCIES[current.currency].words[language];
