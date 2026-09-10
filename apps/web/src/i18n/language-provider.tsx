import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  resolveLanguage,
  translate,
} from "@OpenFarm/i18n";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const STORAGE_KEY = "openfarm.language";
const STORAGE_EVENT = "openfarm:language";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// The remembered choice on this device, read as an external store so the server
// renders the farm default and the client corrects itself after hydration.
const readStored = (): Language | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
};
const subscribeStored = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
};
const writeStored = (language: Language) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    // storage unavailable (private mode); the setting still lives on the user when signed in
  }
};

/** Bangla first. A signed-in person's setting wins; then a choice remembered on this
 *  device; then the farm default. A choice made now applies immediately. */
export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const { data: session } = authClient.useSession();
  const stored = useSyncExternalStore(subscribeStored, readStored, () => null);
  const [chosen, setChosen] = useState<Language | null>(null);

  const language: Language =
    chosen ??
    (session?.user
      ? resolveLanguage(session.user)
      : (stored ?? DEFAULT_LANGUAGE));

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    async (next: Language) => {
      setChosen(next);
      writeStored(next);
      if (session?.user) {
        await orpc.language.set.call({ language: next });
      }
    },
    [session?.user]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
    }),
    [language, setLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return value;
};

/** The translation function for the current language. */
export const useT = () => useLanguage().t;
