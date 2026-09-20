import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  CircleCheck,
  ReceiptText,
  Scale,
  Store,
  Truck,
} from "lucide-react";
import { useState } from "react";

import { SellingTripForm } from "@/components/fattening/selling-trip";
import { Loaded, Page, PageHeader } from "@/components/page";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import type { Sellable } from "@/components/sale/ready-to-go";
import { ReadyToGo } from "@/components/sale/ready-to-go";
import type { SaleAnswers } from "@/components/sale/sale-sheet";
import { NOTHING_TYPED, SaleSheet } from "@/components/sale/sale-sheet";
import type { Sold } from "@/components/sale/todays-sales";
import { TodaysSales } from "@/components/sale/todays-sales";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

const TABS = ["ready", "sold", "trip"] as const;
type Tab = (typeof TABS)[number];

/** The address for a tab: the first tab is the page itself, and says nothing. */
const tabSearch = (value: Tab) => (value === "ready" ? {} : { tab: value });

/** The four figures a morning of selling is judged by: how many went, what they fetched, what that came to a kilo,
 *  and how many more can still go. A dash for what the farm has not answered yet. */
const SaleFigures = ({
  sold,
  sellable,
}: {
  sold: Sold[] | undefined;
  sellable: Sellable[] | undefined;
}) => {
  const { t, language } = useLanguage();
  const taken = sold?.reduce((sum, one) => sum + one.priceBdt, 0);
  const weighed = sold?.reduce((sum, one) => sum + one.weightKg, 0) ?? 0;
  const buyers = new Set(sold?.map((one) => one.buyerName)).size;
  const said = useTaka();
  const taka = (value: number | undefined) =>
    value === undefined ? "—" : said(value);
  return (
    <SummaryFigures
      figures={[
        {
          label: t("sale.kpi.sold"),
          value: sold === undefined ? "—" : formatNumber(sold.length, language),
          hint: t("sale.kpi.soldHint", {
            count: formatNumber(buyers, language),
          }),
          icon: Store,
        },
        {
          label: t("sale.kpi.takings"),
          value: taka(taken),
          hint: t("sale.kpi.takingsHint"),
          icon: Banknote,
          tone: (taken ?? 0) > 0 ? "success" : "neutral",
        },
        {
          label: t("sale.kpi.perKg"),
          value: taken && weighed > 0 ? taka(taken / weighed) : "—",
          hint: t("sale.kpi.perKgHint"),
          icon: Scale,
        },
        {
          label: t("sale.kpi.ready"),
          value:
            sellable === undefined
              ? "—"
              : formatNumber(sellable.length, language),
          hint: t("sale.kpi.readyHint"),
          icon: CircleCheck,
        },
      ]}
    />
  );
};

/**
 * Selling an animal, on Eid morning, on a phone.
 *
 * The day's figures on top; beneath them, by what somebody came for, the animals that can go — each one button from
 * the sale sheet with her already chosen — and the day's sales with the papers each buyer leaves with. Only animals
 * the Manager has already confirmed Ready are offered; a dairy cow going to a butcher is named by her tag in the
 * sheet. Another page sends somebody here to sell one animal with `?sell=`, which opens the sheet with her chosen.
 */
const SalePage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "ready", sell } = Route.useSearch();
  const [answers, setAnswers] = useState<SaleAnswers>(() => ({
    ...NOTHING_TYPED,
    tagNumber: sell ?? "",
  }));
  const [selling, setSelling] = useState(sell !== undefined);
  const sellable = useQuery(orpc.sale.sellable.queryOptions());
  const sold = useQuery(orpc.papers.day.queryOptions({ input: {} }));
  const me = useQuery(orpc.people.me.queryOptions());
  const mayCorrect =
    me.data?.roles.some((role) => role === "manager" || role === "owner") ??
    false;

  const openFor = (tagNumber: string) => {
    setAnswers({ ...answers, tagNumber });
    setSelling(true);
  };

  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={() => setSelling(true)} type="button">
            <Store aria-hidden data-icon="inline-start" />
            {t("sale.record")}
          </Button>
        }
        description={t("sale.subtitle")}
        title={t("sale.title")}
      />

      <SaleFigures sellable={sellable.data} sold={sold.data} />

      <PageTabs
        onChange={(value) =>
          navigate({ replace: true, search: tabSearch(value) })
        }
        tabs={[
          {
            value: "ready",
            label: t("sale.tab.ready"),
            icon: Store,
            count: sellable.data?.length,
            content: (
              <Loaded
                query={sellable}
                skeleton={<Skeleton className="h-40 rounded-xl" />}
              >
                <ReadyToGo onSell={openFor} sellable={sellable.data ?? []} />
              </Loaded>
            ),
          },
          {
            value: "trip",
            label: t("selling.trip"),
            icon: Truck,
            content: <SellingTripForm />,
          },
          {
            value: "sold",
            label: t("sale.today"),
            icon: ReceiptText,
            content: (
              <Loaded
                query={sold}
                skeleton={<Skeleton className="h-40 rounded-xl" />}
              >
                <TodaysSales mayCorrect={mayCorrect} sold={sold.data ?? []} />
              </Loaded>
            ),
          },
        ]}
        value={tab}
      />

      <SaleSheet
        answers={answers}
        onAnswers={setAnswers}
        onOpenChange={(open) => {
          setSelling(open);
          // The address said which animal to sell; once the sheet is closed it has been answered.
          if (!open && sell !== undefined) {
            navigate({ replace: true, search: tabSearch(tab) });
          }
        }}
        open={selling}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/sale")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: SalePage,
  /** Which tab, kept in the address so the page comes back as it was left, and — from another page — which animal to
   *  sell. */
  validateSearch: (
    search: Record<string, unknown>
  ): { tab?: Tab; sell?: string } => ({
    ...(search.tab === "sold" ? { tab: "sold" as const } : {}),
    ...(search.tab === "trip" ? { tab: "trip" as const } : {}),
    ...(typeof search.sell === "string" && search.sell !== ""
      ? { sell: search.sell }
      : {}),
  }),
});
