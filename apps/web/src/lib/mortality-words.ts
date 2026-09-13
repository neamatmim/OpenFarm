import type { Disposal } from "@OpenFarm/domain";
import { STILLBIRTH } from "@OpenFarm/domain";

import type { useT } from "@/i18n/language-provider";

type Translate = ReturnType<typeof useT>;

/** A death's cause as the reader reads it: a stillbirth in their own language, any other cause as it was written. */
export const causeWord = (cause: string, t: Translate): string =>
  cause === STILLBIRTH ? t("mortality.stillbirth") : cause;

/** How a carcass went, or that the farm is still to say: a stillborn calf's waits for the Manager. */
export const disposalWord = (
  disposal: Disposal | null,
  t: Translate
): string =>
  disposal ? t(`mortality.${disposal}`) : t("mortality.awaitingDisposal");
