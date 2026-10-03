import type { Language } from "./languages";
import { bn } from "./messages/bn";
import { en } from "./messages/en";

/** Every language's words, for the server and the tests: both are at hand from the start. The browser reads
 *  `catalog.browser.ts` in its place (package.json `imports`), which fetches only the reader's. */
export const CATALOGS: Partial<Record<Language, Record<string, string>>> = {
  bn,
  en,
};

/** Nothing to fetch here: both are already loaded. */
export const loadMessages = (_language: Language): Promise<void> =>
  Promise.resolve();
