import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import {
  isLanguage,
  loadMessages,
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
import { markBanglaWhileEnglish } from "@/lib/mark-bangla";
import { LANGUAGE_COOKIE, pageLanguage } from "@/lib/page-context";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The device's own note of the reader's language: the same name as the cookie the server reads it from. */
const STORAGE_KEY = LANGUAGE_COOKIE;
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

/** How long the language cookie lasts: a reader who has not been back in a year is asked the farm's default again. */
const A_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** The language kept where the server can read it, so the next page is written in it from the start. Through the
 *  Cookie Store API; a browser without it is written in the farm's default first, as before, then corrected. */
const keepInCookie = async (language: Language) => {
  const { cookieStore } = globalThis as {
    cookieStore?: {
      set: (cookie: {
        name: string;
        value: string;
        path: string;
        expires: number;
        sameSite: "lax";
      }) => Promise<void>;
    };
  };
  try {
    await cookieStore?.set({
      name: LANGUAGE_COOKIE,
      value: language,
      path: "/",
      expires: Date.now() + A_YEAR_MS,
      sameSite: "lax",
    });
  } catch {
    // Kept nowhere the server reads: the next page is corrected after it is drawn, as before.
  }
};

/** Bangla first. A signed-in person's setting wins; then a choice remembered on this
 *  device; then the farm default. A choice made now applies immediately. */
export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const { data: session } = authClient.useSession();
  const stored = useSyncExternalStore(subscribeStored, readStored, () => null);
  const [chosen, setChosen] = useState<Language | null>(null);

  const wanted: Language =
    chosen ??
    (session?.user
      ? resolveLanguage(session.user)
      : (stored ?? pageLanguage()));
  // The page is drawn in the language whose words this browser has: one wanted but not yet fetched is drawn once it
  // is, rather than in its keys.
  const [shownLanguage, setShownLanguage] = useState<Language>(pageLanguage);
  const language = shownLanguage;
  useEffect(() => {
    let current = true;
    const fetchItsWords = async () => {
      await loadMessages(wanted);
      if (current) {
        setShownLanguage(wanted);
      }
    };
    void fetchItsWords();
    return () => {
      current = false;
    };
  }, [wanted]);

  useEffect(() => {
    document.documentElement.lang = language;
    void keepInCookie(language);
  }, [language]);
  // Bangla words on an English page are said to be Bangla, for a screen reader's voice.
  useEffect(
    () => (language === "en" ? markBanglaWhileEnglish() : undefined),
    [language]
  );

  const setLanguage = useCallback(
    async (next: Language) => {
      setChosen(next);
      writeStored(next);
      if (session?.user) {
        try {
          await orpc.language.set.call({ language: next });
        } catch {
          toast.error(translate(next, "common.error"));
        }
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
