import type { Growth } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";
import { useMoneyRate } from "@/lib/money";

/**
 * How a Season or one line of it grew, in a line: kilos a day, Days on Feed and what each kilo gained cost — each said only
 * where there is one. Nothing for an answer kept from before it was said, or a group nobody weighed or fed.
 */
export const GrowthSaid = ({
  growth,
}: {
  growth: Growth | null | undefined;
}) => {
  const { t, language } = useLanguage();
  const rate = useMoneyRate();
  if (!growth) {
    return null;
  }
  const said = [
    growth.gainKgPerDay === null
      ? null
      : t("returns.growth.perDay", {
          kg: formatNumber(growth.gainKgPerDay, language),
        }),
    growth.daysOnFeed === null
      ? null
      : t("returns.growth.daysOnFeed", {
          days: formatNumber(growth.daysOnFeed, language),
        }),
    growth.costOfGainMoney === null
      ? null
      : t("returns.growth.costOfGain", { money: rate(growth.costOfGainMoney) }),
  ].filter((part): part is string => part !== null);
  if (said.length === 0) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-sm tabular-nums">
      {said.join(" · ")}
    </span>
  );
};
