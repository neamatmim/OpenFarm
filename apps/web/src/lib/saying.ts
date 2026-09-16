import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

import {
  correctionRefusalMessage,
  entryRefusalMessage,
} from "./correction-refusal";

// Why the farm would not take something, in the reader's own language. The person reading it is standing at an animal
// with a phone in one hand, and the server's English is not for them — so every refusal the farm gives the facts to
// say is said here, and the server's own words are the last resort rather than the first.

/** What the farm said it refused this for, whatever shape it said it in. */
const refusalIn = (error: unknown): unknown =>
  (error as { data?: { refusal?: unknown } } | null)?.data?.refusal;

/** What the refusal was, by its own word, when the farm gave one. */
const wordOf = (error: unknown): string | null => {
  const refusal = refusalIn(error);
  return typeof refusal === "string" ? refusal : null;
};

/** A refusal an Entry a phone was holding came back with: a kind of refusal, and its own word where it had one. */
const heldEntryRefusal = (
  error: unknown
): { category: "late" | "wrong" | "not_yours"; word?: string } | undefined => {
  const refusal = refusalIn(error);
  return refusal !== null &&
    typeof refusal === "object" &&
    "category" in refusal
    ? (refusal as { category: "late" | "wrong" | "not_yours"; word?: string })
    : undefined;
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
  return (
    correctionRefusalMessage(error, t) ??
    // Only when it is one: a refusal that is a bare word is the farm's, not a phone's, and asking the Outbox to word
    // it would be asking it about a shape it has never seen.
    entryRefusalMessage(heldEntryRefusal(error), t) ??
    (error as Error | null)?.message ??
    t("common.error")
  );
};
