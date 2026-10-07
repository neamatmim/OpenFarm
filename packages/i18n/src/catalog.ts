import type { Language } from "./languages";
import { bn } from "./messages/bn";
import { en } from "./messages/en";

/** Every language's words, for the server and the tests: both are at hand from the start, both halves of each. The
 *  browser reads `catalog.browser.ts` in its place (package.json `imports`), which fetches only the reader's, a half at
 *  a time. */
export const CATALOGS: Partial<Record<Language, Record<string, string>>> = {
  bn,
  en,
};

/** Which half of a language's words. */
export type CatalogPart = "core" | "desk";

/** Nothing to fetch here: both are already loaded. */
export const loadMessages = (
  _language: Language,
  _part: CatalogPart = "core"
): Promise<void> => Promise.resolve();

/** Nothing to fetch here either. */
export const loadDeskWords = (): Promise<void> => Promise.resolve();
