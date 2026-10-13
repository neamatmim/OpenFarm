import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Banknote, CircleCheck, ReceiptText, Scale, Store } from "lucide-react";
import { useState } from "react";

import { NextEid } from "@/components/fattening/next-eid";
import { Loaded, Page, PageHeader } from "@/components/page";
import { FormField, PageTabs, SummaryFigures } from "@/components/page-kit";
import type { Sellable } from "@/components/sale/ready-to-go";
import { ReadyToGo } from "@/components/sale/ready-to-go";
import type { SaleAnswers } from "@/components/sale/sale-sheet";
import { NOTHING_TYPED, SaleSheet } from "@/components/sale/sale-sheet";
import type { Sold } from "@/components/sale/sales-of-the-day";
import { SalesOfTheDay } from "@/components/sale/sales-of-the-day";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { useMoney } from "@/lib/money";
import { TAB_SWITCH } from "@/lib/path-tabs";
import type { SaleTab } from "@/lib/sale-search";
import { saleSearchOf, wasTheTripTab } from "@/lib/sale-search";
import { orpc } from "@/utils/orpc";

/** The address for a tab: the first tab is the page itself, and says nothing. */
const tabSearch = (value: SaleTab) => (value === "ready" ? {} : { tab: value });

/** The four figures a morning of selling is judged by: how many went, what their buyers paid, what they fetched a
 *  kilo, and how many more can still go. A dash for what the farm has not answered yet. What was taken is what was
 *  paid: a buyer who left owing is said beneath it, not counted in it. */
const SaleFigures = ({
  sold,
  sellable,
}: {
  sold: Sold[] | undefined;
  sellable: Sellable[] | undefined;
}) => {
  const { t, language } = useLanguage();
  const fetched = sold?.reduce((sum, one) => sum + one.priceMoney, 0);
  // Left out of an answer cached before Receivable was written down: paid in full, as every such Sale was.
  const owed =
    sold?.reduce((sum, one) => sum + (one.receivableMoney ?? 0), 0) ?? 0;
  const taken = fetched === undefined ? undefined : fetched - owed;
  // And what of it is still owed now, as the buyers' payments since have left it.
  const owingNow =
    sold?.reduce(
      (sum, one) => sum + (one.owingMoney ?? one.receivableMoney ?? 0),
      0
    ) ?? 0;
  const weighed = sold?.reduce((sum, one) => sum + one.weightKg, 0) ?? 0;
  const buyers = new Set(sold?.map((one) => one.buyerName)).size;
  const said = useMoney();
  const asMoney = (value: number | undefined) =>
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
          value: asMoney(taken),
          hint:
            owingNow > 0
              ? t("receivable.owed", {
                  amount: formatNumber(owingNow, language),
                })
              : t("sale.kpi.takingsHint"),
          icon: Banknote,
          tone: (taken ?? 0) > 0 ? "success" : "neutral",
        },
        {
          label: t("sale.kpi.perKg"),
          value: fetched && weighed > 0 ? asMoney(fetched / weighed) : "—",
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
  const { t, language } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "ready", sell, day } = Route.useSearch();
  const today = farmDayOf(new Date());
  // An earlier day, if one was chosen: an address naming today is today, and asks the farm nothing twice.
  const earlier = day !== undefined && day !== today ? day : null;
  const shownDay = earlier ?? today;
  const earlierSaid =
    earlier === null
      ? null
      : formatDate(startOfFarmDay(earlier), language, "date");
  const [answers, setAnswers] = useState<SaleAnswers>(() => ({
    ...NOTHING_TYPED,
    tagNumber: sell ?? "",
  }));
  const [selling, setSelling] = useState(sell !== undefined);
  const sellable = useQuery(orpc.sales.sellable.queryOptions());
  // The figures on top are today's whatever day the sold list is turned to; with no day chosen the two are one read.
  const soldToday = useQuery(orpc.papers.day.queryOptions({ input: {} }));
  const soldOnTheDay = useQuery({
    ...orpc.papers.day.queryOptions({ input: { day: shownDay } }),
    enabled: earlier !== null,
  });
  const sold = earlier === null ? soldToday : soldOnTheDay;
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
        title={t("nav.sale")}
      />

      <SaleFigures sellable={sellable.data} sold={soldToday.data} />
      {/* How long to the Eid the farm sells into, and the day it is on, where the selling is done. */}
      <NextEid />

      <PageTabs
        onChange={(value) =>
          navigate({ ...TAB_SWITCH, search: tabSearch(value) })
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
            value: "sold",
            label: earlierSaid
              ? t("sale.onDay", { day: earlierSaid })
              : t("sale.today"),
            icon: ReceiptText,
            content: (
              <div className="flex flex-col gap-4">
                {/* Yesterday's receipt, or a sale to put right, found by its day rather than by her tag. */}
                <FormField id="sold-on" label={t("sale.soldOn")}>
                  <Input
                    className="sm:w-44"
                    id="sold-on"
                    max={today}
                    onChange={(event) =>
                      navigate({
                        ...TAB_SWITCH,
                        search: {
                          tab: "sold",
                          ...(event.target.value && event.target.value !== today
                            ? { day: event.target.value }
                            : {}),
                        },
                      })
                    }
                    type="date"
                    value={shownDay}
                  />
                </FormField>
                <Loaded
                  query={sold}
                  skeleton={<Skeleton className="h-40 rounded-xl" />}
                >
                  <SalesOfTheDay
                    day={earlierSaid}
                    mayCorrect={mayCorrect}
                    sold={sold.data ?? []}
                  />
                </Loaded>
              </div>
            ),
          },
        ]}
        value={tab}
      />
      {/* The Selling Trips have one page, beside the Buying Trips. */}
      <Link
        className="text-primary self-start text-sm underline-offset-4 hover:underline"
        search={{ tab: "selling" }}
        to="/trips"
      >
        {t("trips.sellingLink")}
      </Link>

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

export const Route = createFileRoute("/_authenticated/sales")({
  beforeLoad: (options) => {
    onlyFor("runsTheFarm")(options);
    // The Selling Trips were a tab here once; an address kept from then opens them where they are now.
    if (wasTheTripTab(options.location.search)) {
      throw redirect({ to: "/trips", search: { tab: "selling" } });
    }
  },
  component: SalePage,
  /** Which tab, kept in the address so the page comes back as it was left; which day's sales the sold list shows;
   *  and — from another page — which animal to sell. */
  validateSearch: saleSearchOf,
});
