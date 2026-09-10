import { formatNumber } from "./format";
import type { Language } from "./languages";
import { bn } from "./messages/bn";
import { en } from "./messages/en";

export type { MessageKey } from "./messages/en";

type MessageKey = keyof typeof en;

const MESSAGES: Record<Language, Record<MessageKey, string>> = { bn, en };

export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(?<name>\w+)\}/gu;

/** Look up a message in a language and fill `{name}` placeholders. Numbers are
 *  formatted for the language (Bangla numerals in Bangla). */
export const translate = (
  language: Language,
  key: MessageKey,
  params: MessageParams = {}
): string =>
  MESSAGES[language][key].replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      return match;
    }
    return typeof value === "number" ? formatNumber(value, language) : value;
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
