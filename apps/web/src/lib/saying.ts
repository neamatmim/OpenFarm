import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

import {
  correctionRefusalMessage,
  entryRefusalMessage,
} from "@/lib/correction-refusal";

// Why the farm would not take something, in the reader's own language. The person reading it is standing at an animal
// with a phone in one hand, and the server's English is not for them — so every refusal the farm gives the facts to
// say is said here, and the server's own words are the last resort rather than the first.

/** What the refusal was, by its own word, when the farm gave one. */
const wordOf = (error: unknown): string | null => {
  const refusal = (error as { data?: { refusal?: unknown } })?.data?.refusal;
  return typeof refusal === "string" ? refusal : null;
};

/**
 * The refusals a screen's own procedure gives, which the farm's shared list does not know: a Playbook with no
 * treatment procedure to prescribe against, a PIN that is not this person's to set. Given by the screen that can
 * meet them.
 */
export type OwnWords = Readonly<Record<string, MessageKey>>;

/**
 * Says why the farm refused: the screen's own words for it, then the farm's — a Correction Window, an Entry the world
 * moved past, a refusal with a word of its own — and only then whatever the server said in English.
 */
export const sayWhy = (
  error: unknown,
  t: (key: MessageKey, params?: MessageParams) => string,
  ownWords: OwnWords = {}
): string => {
  const own = ownWords[wordOf(error) ?? ""];
  if (own) {
    return t(own);
  }
  const refusal = (error as { data?: { refusal?: unknown } })?.data?.refusal;
  return (
    correctionRefusalMessage(error, t) ??
    entryRefusalMessage(
      refusal as Parameters<typeof entryRefusalMessage>[0],
      t
    ) ??
    (error as Error)?.message ??
    t("common.error")
  );
};

/** Whether what the farm said means the screen is holding something out of date, and should read it again. */
export { isChangedSince as wasChangedSince } from "@/lib/correction-refusal";
