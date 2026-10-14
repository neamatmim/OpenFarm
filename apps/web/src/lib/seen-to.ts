import type { MessageKey } from "@OpenFarm/i18n";

import type { orpc } from "@/utils/orpc";

/** What has been done about a cow giving less, as the farm answers it: the Vet saw her, or somebody put her in front of
 *  the Vet. */
export type SeenTo = NonNullable<
  Awaited<ReturnType<typeof orpc.milk.givingLess.call>>[number]["seenTo"]
>;

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
