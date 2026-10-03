import type { Language } from "./languages";
import { bn } from "./messages/bn";
import { en } from "./messages/en";

const CATALOGS: Record<Language, Record<string, string>> = { bn, en };

/** Every key with a missing or empty translation in a language, and keys that
 *  exist in the language but not in the English source. Empty means complete. */
export const findTranslationGaps = (
  language: Language
): { missing: string[]; stray: string[] } => {
  const source = Object.keys(en);
  const target = CATALOGS[language] as Record<string, string | undefined>;
  const missing = source.filter((key) => !target[key]?.trim());
  const stray = Object.keys(target).filter((key) => !(key in en));
  return { missing, stray };
};
