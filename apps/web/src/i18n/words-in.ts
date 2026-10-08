import type { Language } from "@OpenFarm/i18n";
import { loadMessages } from "@OpenFarm/i18n";
import { useEffect, useState } from "react";

/**
 * Whether this browser holds a language's words, fetching both halves of them when it does not. The browser holds only
 * the language its reader reads (`catalog.browser.ts`), and a word asked for in another falls back to the English — so
 * whatever draws words in a language of its own, a paper read in English on a Bangla screen or a card that is always
 * Bangla, waits on this before it is drawn or printed.
 */
export const useWordsIn = (language: Language): boolean => {
  const [held, setHeld] = useState<Language | null>(null);
  useEffect(() => {
    let current = true;
    const fetchThem = async () => {
      await loadMessages(language, "core");
      await loadMessages(language, "desk");
      if (current) {
        setHeld(language);
      }
    };
    void fetchThem();
    return () => {
      current = false;
    };
  }, [language]);
  return held === language;
};
