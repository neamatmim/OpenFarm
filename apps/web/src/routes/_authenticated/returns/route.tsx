import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Beef, Landmark, Milk } from "lucide-react";

import { Notice, Page, PageHeader, Section } from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { BankRateAction, BankRateList } from "@/components/returns/bank-rate";
import { CrossingsToPrice } from "@/components/returns/crossings";
import {
  AnimalsToPrice,
  DairyGone,
  DairyHerdNow,
  HeadPriceList,
} from "@/components/returns/dairy-returns";
import {
  FinishedReturns,
  MissingPrices,
  ReturnsChart,
  StillGoing,
  useReturns,
} from "@/components/returns/returns-page";
import { AcrossSeasons } from "@/components/returns/season-breakdown";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { TAB_SWITCH, useTabOfPath } from "@/lib/path-tabs";

const TABS = ["fattening", "dairy", "prices"] as const;
type Tab = (typeof TABS)[number];

/** Each tab at its own address, the first at the page's own. */
const TAB_PATHS = {
  fattening: "/returns",
  dairy: "/returns/dairy",
  prices: "/returns/head-prices",
} as const satisfies Record<Tab, string>;

/**
 * What the money in the farm's cattle returned, for the Owner: each Season of the Farm's own fattening cattle and each
 * settled Venture, worked as a Settlement is, with what every hundred taka made, the days its money was out and that
 * scaled to a year beside the bank's rate; under Dairy, the herd now and each dairy animal gone with her calves; and,
 * under Prices, the prices the Owner types. The tab is kept in the
 * address, so the page comes back as it was left.
 */
const ReturnsPage = () => {
  const { t } = useLanguage();
  const returns = useReturns();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = useTabOfPath(TAB_PATHS) ?? "fattening";
  const header = (
    <PageHeader description={t("returns.subtitle")} title={t("nav.returns")} />
  );
  if (!returns.data) {
    return (
      <Page>
        {header}
        {returns.isError ? (
          <Notice title={t("common.loadFailed")} tone="danger" />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </Page>
    );
  }
  const page = returns.data;
  // Read together only once two Seasons have finished: one read against itself shows nothing.
  const twoFinished = page.seasons.filter((one) => one.finished).length > 1;
  return (
    <Page>
      {header}
      <MissingPrices page={page} />
      <PageTabs
        onChange={(value) => navigate({ ...TAB_SWITCH, to: TAB_PATHS[value] })}
        tabs={[
          {
            value: "fattening",
            label: t("returns.tab.fattening"),
            icon: Beef,
            content: (
              <div className="flex flex-col gap-6">
                <Section
                  description={t("returns.chartHint")}
                  title={t("returns.chartTitle")}
                >
                  <ReturnsChart page={page} />
                </Section>
                <Section
                  description={t("returns.finishedHint")}
                  title={t("returns.finishedTitle")}
                >
                  <FinishedReturns page={page} />
                </Section>
                {twoFinished ? (
                  <Section
                    description={t("returns.acrossHint")}
                    title={t("returns.acrossTitle")}
                  >
                    <AcrossSeasons />
                  </Section>
                ) : null}
                <Section
                  description={t("returns.stillGoingHint")}
                  title={t("returns.stillGoingTitle")}
                >
                  <StillGoing page={page} />
                </Section>
                <p className="text-muted-foreground text-sm italic">
                  {t("returns.leftOut")}
                </p>
              </div>
            ),
          },
          {
            value: "dairy",
            label: t("returns.tab.dairy"),
            icon: Milk,
            content: (
              <div className="flex flex-col gap-6">
                <Section
                  description={t("returns.herdNowHint")}
                  title={t("returns.herdNowTitle")}
                >
                  <DairyHerdNow page={page} />
                </Section>
                <Section
                  description={t("returns.goneHint")}
                  title={t("returns.goneTitle")}
                >
                  <DairyGone page={page} />
                </Section>
                <p className="text-muted-foreground text-sm italic">
                  {t("returns.leftOut")}
                </p>
              </div>
            ),
          },
          {
            value: "prices",
            label: t("returns.tab.prices"),
            icon: Landmark,
            content: (
              <div className="flex flex-col gap-6">
                <Section
                  description={t("returns.toPriceHint")}
                  title={t("returns.toPriceTitle")}
                >
                  <AnimalsToPrice page={page} />
                </Section>
                <Section
                  description={t("returns.headPricesHint")}
                  title={t("returns.headPricesTitle")}
                >
                  <HeadPriceList page={page} />
                </Section>
                <Section
                  description={t("returns.crossingsHint")}
                  title={t("returns.crossingsTitle")}
                >
                  <CrossingsToPrice page={page} />
                </Section>
                <Section
                  action={<BankRateAction />}
                  description={t("returns.bankHint")}
                  title={t("returns.bankTitle")}
                >
                  <BankRateList page={page} />
                </Section>
              </div>
            ),
          },
        ]}
        value={tab}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/returns")({
  beforeLoad: onlyFor("owner"),
  component: ReturnsPage,
});
