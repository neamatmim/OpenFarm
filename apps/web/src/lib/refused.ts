import type { MessageKey } from "@OpenFarm/i18n";
import { useNavigate } from "@tanstack/react-router";

import { useT } from "@/i18n/language-provider";
import type { PlainPage } from "@/lib/open-form";
import { sayInOpenForm } from "@/lib/open-form";
import { toast } from "@/lib/toast";

import type { OwnWords } from "./saying";
import { sayWhy, wordOf } from "./saying";

/** The refusals a screen's procedure gives that are put right on another page, by the refusal's word: the words for
 *  going there, and the page — the farm's records facts, written on the Agreement templates page. */
export type OwnWays = Readonly<
  Record<string, { label: MessageKey; to: PlainPage }>
>;

/**
 * What a save does when the farm refuses it: says why, in the reader's language — the screen's own words for what only
 * it meets, then the farm's, and the server's English only when the farm gave no word at all.
 *
 * One hook every sheet hands its save, so no sheet words a refusal by hand: the ones that did said a Correction
 * Window's refusal, and an Entry the Outbox sent back, in English. While one of the kit's forms is open, the refusal
 * is said at that form's top (`lib/open-form.ts`), not in a toast beside it.
 */
export const useRefused = (ownWords?: OwnWords, ownWays?: OwnWays) => {
  const t = useT();
  const navigate = useNavigate();
  return (error: unknown) => {
    const why = sayWhy(error, t, ownWords);
    const known = ownWays?.[wordOf(error) ?? ""];
    const way = known ? { label: t(known.label), to: known.to } : undefined;
    // Said in the form it is about when one of the kit's forms is open; in a toast otherwise.
    if (sayInOpenForm(why, way)) {
      return;
    }
    toast.error(
      why,
      way
        ? {
            action: {
              label: way.label,
              onClick: () => navigate({ to: way.to }),
            },
          }
        : undefined
    );
  };
};
