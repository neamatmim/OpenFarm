import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";

import { Loaded, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

type Seller = Awaited<ReturnType<typeof orpc.stock.onTheScale.call>>[number];

/** One seller's lots on the scale: the slips against the scale, and what was short in kilos, percent and taka. */
const SellerLine = ({ seller }: { seller: Seller }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const runsShort = seller.shortKg > 0;
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="flex flex-col">
        <span className="font-medium">{seller.sellerName}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("scale.lots", { count: seller.lots })}
          {" · "}
          {t("scale.slipAndScale", {
            slip: formatNumber(seller.slipKg, language),
            weighed: formatNumber(seller.weighedKg, language),
          })}
        </span>
      </span>
      <span
        className={
          runsShort
            ? "text-warning text-sm font-medium tabular-nums"
            : "text-muted-foreground text-sm tabular-nums"
        }
      >
        {runsShort
          ? `${t("stock.shortOnScale", {
              kg: formatNumber(seller.shortKg, language),
            })} (${formatNumber(seller.shortPercent, language)}%) · ${asMoney(
              seller.shortMoney
            )}`
          : t("stock.overOnScale", {
              kg: formatNumber(-seller.shortKg, language),
            })}
      </span>
    </li>
  );
};

/**
 * How short each seller has run on the farm's scale over the last ninety days, the most taka first — from the lots
 * weighed as they came, so a seller the farm never weighs is never named. Above the lots themselves.
 */
export const ScaleBySeller = () => {
  const { t } = useLanguage();
  const sellers = useQuery(orpc.stock.onTheScale.queryOptions());
  if (!sellers.data) {
    return (
      <Loaded
        query={sellers}
        skeleton={<Skeleton aria-hidden className="h-32 rounded-xl" />}
      >
        {null}
      </Loaded>
    );
  }
  return (
    <Section
      description={
        sellers.data.length === 0 ? t("scale.none") : t("scale.hint")
      }
      title={t("scale.title")}
    >
      {sellers.data.length === 0 ? null : (
        <ul className="divide-y">
          {sellers.data.map((seller) => (
            <SellerLine key={seller.sellerId} seller={seller} />
          ))}
        </ul>
      )}
    </Section>
  );
};
