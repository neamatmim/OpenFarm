import type { MessageKey } from "@OpenFarm/i18n";

/** What has been done about a cow giving less: the Vet saw her, or somebody put her in front of the Vet. */
export interface SeenTo {
  by: "vet" | "asked";
  at: Date;
}

/**
 * The words for what has been done about a cow on "Giving less", or nothing when nobody has acted — or when the answer
 * was kept on a phone from before the list said (`undefined`).
 */
export const seenToSaid = (
  seenTo: SeenTo | null | undefined
): { key: MessageKey; at: Date } | null => {
  if (!seenTo) {
    return null;
  }
  return {
    key: seenTo.by === "vet" ? "givingLess.seenByVet" : "givingLess.vetAsked",
    at: seenTo.at,
  };
};
