/** The languages the app speaks. Bangla is the farm's default; English is available per user. */
export const LANGUAGES = ["bn", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "bn";

export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** The language a person sees: their setting when it is one we speak, else the farm default. */
export const resolveLanguage = (
  user: { language?: string | null } | null | undefined
): Language => (isLanguage(user?.language) ? user.language : DEFAULT_LANGUAGE);
