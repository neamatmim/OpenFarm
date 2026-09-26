import type { CullReason } from "@OpenFarm/domain";
import { MILK_PRICE_DAYS } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarX, ListX, Milk, Repeat } from "lucide-react";

import type { CullList } from "@/components/culling/cull-list";
import { CullBoard, useCullList } from "@/components/culling/cull-list";
import { Notice, Page, PageHeader } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { useTakaToThePaisa } from "@/lib/taka";

/** How many cows are named, and for each reason how many it names: a cow named twice counts under both. */
const CullFigures = ({
  cows,
  openDays,
}: {
  cows: CullList["cows"];
  /** The farm's days empty after calving; missing from an answer this phone kept from before it was a setting. */
  openDays: number | undefined;
}) => {
  const { t, language } = useLanguage();
  const named = cows.filter((cow) => cow.reasons.length > 0).length;
  const count = (reason: CullReason) =>
    cows.filter((cow) => cow.reasons.includes(reason)).length;
  const milkShort = count("milk_short");
  const openLong = count("open_long");
  const repeat = count("repeat_breeder");
  return (
    <SummaryFigures
      figures={[
        {
          label: t("cull.named"),
          value: formatNumber(named, language),
          hint: t("cull.namedHint"),
          icon: ListX,
          tone: named > 0 ? "warning" : "neutral",
        },
        {
          label: t("cull.reason.milk_short"),
          value: formatNumber(milkShort, language),
          hint: t("cull.milkHint"),
          icon: Milk,
          tone: milkShort > 0 ? "danger" : "neutral",
        },
        {
          label: t("cull.reason.open_long"),
          value: formatNumber(openLong, language),
          hint:
            openDays === undefined
              ? t("cull.openHintUnset")
              : t("cull.openHint", { days: openDays }),
          icon: CalendarX,
          tone: openLong > 0 ? "warning" : "neutral",
        },
        {
          label: t("cull.reason.repeat_breeder"),
          value: formatNumber(repeat, language),
          hint: t("cull.repeatHint"),
          icon: Repeat,
          tone: repeat > 0 ? "warning" : "neutral",
        },
      ]}
    />
  );
};

/** What a litre is priced at for every cow on the page, and where that came from — or that nothing could be. */
const MilkPriceLine = ({ price }: { price: CullList["milkPrice"] }) => {
  const { t } = useLanguage();
  const perLitre = useTakaToThePaisa();
  if (!price) {
    return (
      <Notice
        title={t("cull.unpriced", { days: MILK_PRICE_DAYS })}
        tone="warning"
      />
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      {t("cull.price", {
        price: perLitre(price.bdtPerLitre),
        days: price.days,
      })}
    </p>
  );
};

/**
 * The cows the farm names for the Owner to think about letting go, and why — her milk against her keep, empty long
 * after calving or dry and empty, or not settling — beside every other cow in milk or dry. The Owner's alone, since
 * it sets a cow's milk against her money, and nothing to answer: a cow leaves the list when the facts under her change.
 */
const CullingPage = () => {
  const { t } = useLanguage();
  const list = useCullList();
  const header = (
    <PageHeader description={t("cull.subtitle")} title={t("nav.culling")} />
  );
  if (!list.data) {
    return (
      <Page>
        {header}
        {list.isError ? (
          <Notice title={t("common.loadFailed")} tone="danger" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {["a", "b", "c", "d"].map((key) => (
                <Skeleton className="h-28 rounded-xl" key={key} />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </>
        )}
      </Page>
    );
  }
  return (
    <Page>
      {header}
      <CullFigures cows={list.data.cows} openDays={list.data.openDays} />
      <MilkPriceLine price={list.data.milkPrice} />
      <CullBoard cows={list.data.cows} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/culling")({
  beforeLoad: onlyFor("owner"),
  component: CullingPage,
});
