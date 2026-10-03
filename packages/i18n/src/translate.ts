import { currencySign, currencyWords, farmCountryName } from "./farm-locale";
import { formatNumber, numberAsTyped } from "./format";
import type { Language } from "./languages";
import { bn } from "./messages/bn";
import { en } from "./messages/en";

export type { MessageKey } from "./messages/en";

type MessageKey = keyof typeof en;

const MESSAGES: Record<Language, Record<MessageKey, string>> = { bn, en };

export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(?<name>\w+)\}/gu;

/** The ICU plural a message writes where the word changes with the number: `{count, plural, one {# pen} other {#
 *  pens}}`, `#` standing for the number. Only English needs it — Bangla says ১টি পেন and ৩টি পেন alike. */
const PLURAL =
  /\{(?<name>\w+), plural, one \{(?<one>[^{}]*)\} other \{(?<other>[^{}]*)\}\}/gu;

const said = (value: string | number, language: Language): string =>
  typeof value === "number" ? formatNumber(value, language) : value;

/** The words for a key in a language — the English where that language has none, and the key itself where neither
 *  has: a key a screen builds by hand is no type error when its words are missing, and a page says what it can rather
 *  than going blank. */
const wordsFor = (language: Language, key: MessageKey): string =>
  (MESSAGES[language] as Partial<Record<string, string>>)[key] ??
  (MESSAGES.en as Partial<Record<string, string>>)[key] ??
  key;

/** What every message may say without being told: the farm's currency, as the sign before a figure
 *  (`{currencySign}`), one of it (`{currencyOne}`: every taka), a sum of it after its figure (`{currencySum}`: ২০০
 *  টাকা) and, in Bangla, of it and in it (`{currencyOf}`: টাকার, `{currencyIn}`: টাকায়); and the country it is in,
 *  as a sentence names it (`{farmCountry}`: বাংলাদেশ). */
export const FARM_WORDS = [
  "currencySign",
  "currencyOne",
  "currencySum",
  "currencyOf",
  "currencyIn",
  "farmCountry",
] as const;

const farmWords = (
  language: Language
): Record<(typeof FARM_WORDS)[number], string> => {
  const words = currencyWords(language);
  return {
    currencySign: currencySign(),
    currencyOne: words.one,
    currencySum: words.sum,
    currencyOf: words.of,
    currencyIn: words.in,
    farmCountry: farmCountryName(language),
  };
};

/** Look up a message in a language and fill `{name}` placeholders. Numbers are
 *  formatted for the language (Bangla numerals in Bangla), and a plural takes the
 *  form its number asks for — from the figure, even when a screen has already
 *  written it out as text. */
export const translate = (
  language: Language,
  key: MessageKey,
  given: MessageParams = {}
): string => {
  const params: MessageParams = { ...farmWords(language), ...given };
  return wordsFor(language, key)
    .replace(PLURAL, (match, name: string, one: string, other: string) => {
      const value = params[name];
      if (value === undefined) {
        return match;
      }
      const figure =
        typeof value === "number" ? value : Number(numberAsTyped(value));
      const form =
        new Intl.PluralRules(language).select(figure) === "one" ? one : other;
      return form.replaceAll("#", said(value, language));
    })
    .replace(PLACEHOLDER, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : said(value, language);
    });
};

/** Every key with a missing or empty translation in a language, and keys that
 *  exist in the language but not in the English source. Empty means complete. */
export const findTranslationGaps = (
  language: Language
): { missing: string[]; stray: string[] } => {
  const source = Object.keys(en);
  const target = MESSAGES[language] as Record<string, string | undefined>;
  const missing = source.filter((key) => !target[key]?.trim());
  const stray = Object.keys(target).filter((key) => !(key in en));
  return { missing, stray };
};
