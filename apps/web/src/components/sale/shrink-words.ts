import type { Shrink } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/**
 * A Shrink in words: how many kilos lighter than her last weighing and what part of her, or — heavier — a word to
 * check the scale; and, where that weighing is older than the farm trusts, how old.
 */
export const useShrinkWords = () => {
  const { t, language } = useLanguage();
  return (shrink: Pick<Shrink, "lostKg" | "percent" | "days" | "stale">) => {
    const said =
      shrink.lostKg >= 0
        ? t("sale.shrinkLost", {
            kg: formatNumber(shrink.lostKg, language),
            percent: formatNumber(shrink.percent, language),
          })
        : t("sale.shrinkGained", {
            kg: formatNumber(-shrink.lostKg, language),
          });
    return shrink.stale
      ? `${said} ${t("sale.shrinkStale", { days: shrink.days })}`
      : said;
  };
};
