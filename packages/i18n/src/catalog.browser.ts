import type { Language } from "./languages";

/**
 * The words the browser has fetched, a language at a time, and each language in two halves: what every screen may need,
 * and what only a desk or the portal reads (`catalog-areas.ts`). A reader reads one language, and a Shed Phone's first
 * screen needs only the first half — the rest of a language is a third of it — so the desk's words are fetched once the
 * screen is drawn, or before a desk or portal page is (`apps/web/src/client.tsx`, the root route).
 */
export const CATALOGS: Partial<Record<Language, Record<string, string>>> = {};

/** Which half of a language's words. */
export type CatalogPart = "core" | "desk";

const FETCH: Record<
  Language,
  Record<CatalogPart, () => Promise<Record<string, string>>>
> = {
  bn: {
    core: async () => {
      const { bnCore } = await import("./messages/bn-core");
      return bnCore;
    },
    desk: async () => {
      const { bnDesk } = await import("./messages/bn-desk");
      return bnDesk;
    },
  },
  en: {
    core: async () => {
      const { enCore } = await import("./messages/en-core");
      return enCore;
    },
    desk: async () => {
      const { enDesk } = await import("./messages/en-desk");
      return enDesk;
    },
  },
};

/** The halves each language holds, and those on their way: asked twice, fetched once. */
const held = new Map<string, Promise<void>>();

const fetchHalf = async (language: Language, part: CatalogPart) => {
  const words = await FETCH[language][part]();
  CATALOGS[language] = { ...CATALOGS[language], ...words };
};

/**
 * Fetches a language's words, the shed's half or the desk's, once; a second ask for the same is answered by the first.
 * The desk's half lands beside the shed's, so `translate` reads one catalog either way.
 */
export const loadMessages = (
  language: Language,
  part: CatalogPart = "core"
): Promise<void> => {
  const key = `${language}:${part}`;
  const waiting = held.get(key) ?? fetchHalf(language, part);
  held.set(key, waiting);
  return waiting;
};

/**
 * The desk's words for every language whose shed words the browser holds: what a desk or portal page waits for. Never
 * refused: a fetch that fails — no signal, never cached — is forgotten, to be tried again on the next page, and the page
 * shows what it has meanwhile.
 */
export const loadDeskWords = async (): Promise<void> => {
  await Promise.all(
    (Object.keys(CATALOGS) as Language[]).map(async (language) => {
      try {
        await loadMessages(language, "desk");
      } catch {
        held.delete(`${language}:desk`);
      }
    })
  );
};
