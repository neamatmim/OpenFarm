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

/** Look up a message in a language and fill `{name}` placeholders. Numbers are
 *  formatted for the language (Bangla numerals in Bangla), and a plural takes the
 *  form its number asks for — from the figure, even when a screen has already
 *  written it out as text. */
export const translate = (
  language: Language,
  key: MessageKey,
  params: MessageParams = {}
): string =>
  MESSAGES[language][key]
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
