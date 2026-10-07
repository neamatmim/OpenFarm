import { feedUnitWord } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";
import { namesIn } from "@/lib/names-in";

/** A feed running low, as either home names it: under the Manager's level, or short of days at the rate it is fed. An
 *  answer kept from before days were said is read as under its level. */
export const LowStockWords = ({
  line,
}: {
  line: {
    nameBn: string;
    nameEn?: string | null;
    onHand: number;
    unit: string;
    threshold: number;
    because?: "level" | "days";
    daysLeft?: number | null;
  };
}) => {
  const { t, language } = useLanguage();
  const said = {
    feed: namesIn(line, language).shown,
    onHand: formatNumber(line.onHand, language),
    unit: feedUnitWord(line.unit, language),
  };
  if (line.because === "days" && line.daysLeft !== undefined) {
    return t("home.lowStockDays", { ...said, days: line.daysLeft ?? 0 });
  }
  return t("home.lowStockLine", {
    ...said,
    threshold: formatNumber(line.threshold, language),
  });
};
