import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/** How far a Feed Purchase's price per unit moved on the last purchase of the same feed, in words — dearer in the
 *  colour of something to ask about, cheaper or the same plainly. */
export const PriceChange = ({ percent }: { percent: number }) => {
  const { t, language } = useLanguage();
  const said = formatNumber(Math.abs(percent), language);
  if (percent > 0) {
    return (
      <span className="text-warning font-medium">
        {t("stock.dearer", { percent: said })}
      </span>
    );
  }
  return (
    <span>
      {percent < 0
        ? t("stock.cheaper", { percent: said })
        : t("stock.sameAsLast")}
    </span>
  );
};
