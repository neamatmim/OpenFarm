import type { Language } from "./languages";

/**
 * The words the browser has fetched, a language at a time. A reader reads one of the two, and the pair together was
 * a third of what every page loaded before its own code (docs/research/next-improvements.md §2); each is now its own
 * file, fetched before the page is drawn in it (`apps/web/src/client.tsx`) or when the reader switches.
 */
export const CATALOGS: Partial<Record<Language, Record<string, string>>> = {};

const FETCH: Record<Language, () => Promise<Record<string, string>>> = {
  bn: async () => {
    const { bn } = await import("./messages/bn");
    return bn;
  },
  en: async () => {
    const { en } = await import("./messages/en");
    return en;
  },
};

/** Fetches a language's words once; a second ask for the same is answered at once. */
export const loadMessages = async (language: Language): Promise<void> => {
  CATALOGS[language] ??= await FETCH[language]();
};
