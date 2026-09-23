import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";

import type { OwnWords } from "./saying";
import { sayWhy } from "./saying";

/**
 * What a save does when the farm refuses it: says why, in the reader's language — the screen's own words for what only
 * it meets, then the farm's, and the server's English only when the farm gave no word at all.
 *
 * One hook every sheet hands its save, so no sheet words a refusal by hand: the ones that did said a Correction
 * Window's refusal, and an Entry the Outbox sent back, in English.
 */
export const useRefused = (ownWords?: OwnWords) => {
  const t = useT();
  return (error: unknown) => {
    toast.error(sayWhy(error, t, ownWords));
  };
};
