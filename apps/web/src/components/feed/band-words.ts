import type { WeightBand } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import type { useLanguage } from "@/i18n/language-provider";

type Words = Pick<ReturnType<typeof useLanguage>, "t" | "language">;

/** A Ration's weight band in the reader's words — "150–250 kg", "from 250 kg", "under 150 kg" — or nothing for a
 *  Ration written for any weight. */
export const bandSaid = (
  { fromKg, toKg }: WeightBand,
  { t, language }: Words
): string | null => {
  if (fromKg !== null && toKg !== null) {
    return t("feed.bandRange", {
      from: formatNumber(fromKg, language),
      to: formatNumber(toKg, language),
    });
  }
  if (fromKg !== null) {
    return t("feed.bandFromOnly", { from: formatNumber(fromKg, language) });
  }
  if (toKg !== null) {
    return t("feed.bandToOnly", { to: formatNumber(toKg, language) });
  }
  return null;
};
