import { farmDayOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  Coins,
  CookingPot,
  PackagePlus,
  ShoppingCart,
  TriangleAlert,
  Truck,
  Utensils,
  Warehouse,
  Wheat,
} from "lucide-react";
import { useState } from "react";

import { ArrivalsTab, CountsTab } from "@/components/feed/feed-history";
import { ItemsTab } from "@/components/feed/feed-items";
import { LeftoversTab } from "@/components/feed/feed-leftovers";
import { RationsTab } from "@/components/feed/feed-rations";
import { StockTab } from "@/components/feed/feed-stock";
import type {
  Arrival,
  FeedItemRow,
  RationRow,
  StockLine,
} from "@/components/feed/feed-types";
import { standingOf, valueOf } from "@/components/feed/feed-types";
import { ReceiveFeedSheet } from "@/components/feed/receive-feed-sheet";
import { Loaded, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

const TABS = [
  "stock",
  "arrivals",
  "counts",
  "leftovers",
  "rations",
  "items",
] as const;
type Tab = (typeof TABS)[number];

/** Feed Items still fed that hold nothing, or less than their level. */
const shortOf = (lines: StockLine[]) =>
  lines.filter(
    (line) => !line.retiredAt && ["low", "out"].includes(standingOf(line))
  ).length;

/** The four figures the store is judged by: how many Feed Items it holds, how many are Running Low, what it is worth,
 *  and what feed was bought this month. */
const useStoreFigures = (lines: StockLine[], arrivals: Arrival[]): Figure[] => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const live = lines.filter((line) => !line.retiredAt);
  const short = shortOf(lines);
  const worth = live.reduce((sum, line) => sum + (valueOf(line) ?? 0), 0);
  const month = farmDayOf(new Date()).slice(0, 7);
  const bought = arrivals.filter(
    (one) =>
      one.priceBdt !== null &&
      farmDayOf(new Date(one.receivedOn)).slice(0, 7) === month
  );
  const spent = bought.reduce((sum, one) => sum + (one.priceBdt ?? 0), 0);
  return [
    {
      label: t("feed.kpi.items"),
      value: formatNumber(live.length, language),
      hint: t("feed.kpi.itemsHint"),
      icon: Warehouse,
    },
    {
      label: t("feed.kpi.low"),
      value: formatNumber(short, language),
      hint: t("feed.kpi.lowHint"),
      icon: TriangleAlert,
      tone: short > 0 ? "warning" : "neutral",
    },
    {
      label: t("feed.kpi.value"),
      value: taka(worth),
      hint: t("feed.kpi.valueHint"),
      icon: Coins,
    },
    {
      label: t("feed.kpi.bought"),
      value: taka(spent),
      hint: t("feed.kpi.boughtHint", {
        count: formatNumber(bought.length, language),
      }),
      icon: ShoppingCart,
    },
  ];
};

/**
 * The store and what feeds from it, by what somebody came to do: see what is in the store, look back at what came in
 * or what a count found, put Pens on Rations, or keep the list of Feed Items. Feed coming in is one button away from
 * every tab. The tab is kept in the address, so a page comes back as it was left.
 */
const FeedPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "stock" } = Route.useSearch();
  const [receiving, setReceiving] = useState<{ feedItemId?: string } | null>(
    null
  );

  const me = useQuery(orpc.people.me.queryOptions());
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const items = useQuery(orpc.feed.items.queryOptions());
  const rations = useQuery(orpc.feed.rations.queryOptions());
  const stock = useQuery(orpc.stock.onHand.queryOptions());
  const arrivals = useQuery(orpc.stock.arrivals.queryOptions({ input: {} }));
  const adjustments = useQuery(
    orpc.stock.adjustments.queryOptions({ input: {} })
  );

  // The store is the Manager's to keep, and the Owner's, who may do anything the Manager does.
  const mayRecord =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;
  // A list cached before bags had a size has none: nothing is bought by the bag until it is said again.
  const feedItems: FeedItemRow[] = (items.data ?? []).map((item) => ({
    ...item,
    bagSizeKg: item.bagSizeKg ?? null,
  }));
  const lines = stock.data ?? [];
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );
  const figures = useStoreFigures(lines, arrivals.data ?? []);

  return (
    <Page>
      <PageHeader
        actions={
          mayRecord ? (
            <Button onClick={() => setReceiving({})} type="button">
              <PackagePlus aria-hidden data-icon="inline-start" />
              {t("stock.recordArrival")}
            </Button>
          ) : null
        }
        description={t("feed.subtitle")}
        title={t("feed.title")}
      />

      <SummaryFigures figures={figures} />

      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "stock" ? {} : { tab: value },
          })
        }
        tabs={[
          {
            value: "stock",
            label: t("feed.tab.stock"),
            icon: Warehouse,
            count: shortOf(lines),
            content: (
              <Loaded query={stock}>
                <StockTab
                  lines={lines}
                  mayRecord={mayRecord}
                  onReceive={(feedItemId) => setReceiving({ feedItemId })}
                />
              </Loaded>
            ),
          },
          {
            value: "arrivals",
            label: t("feed.tab.arrivals"),
            icon: Truck,
            content: (
              <Loaded query={arrivals}>
                <ArrivalsTab
                  arrivals={arrivals.data ?? []}
                  items={feedItems}
                  mayCorrect={mayRecord}
                />
              </Loaded>
            ),
          },
          {
            value: "counts",
            label: t("feed.tab.counts"),
            icon: ClipboardList,
            content: (
              <Loaded query={adjustments}>
                <CountsTab
                  adjustments={adjustments.data ?? []}
                  items={feedItems}
                />
              </Loaded>
            ),
          },
          // What the feed left in the trough cost, so the Owner's and the Manager's, as the farm's money is.
          ...(mayRecord
            ? [
                {
                  value: "leftovers" as const,
                  label: t("feed.tab.leftovers"),
                  icon: CookingPot,
                  content: <LeftoversTab />,
                },
              ]
            : []),
          {
            value: "rations",
            label: t("feed.tab.rations"),
            icon: Utensils,
            content: (
              <Loaded query={rations}>
                <RationsTab
                  items={feedItems}
                  mayEdit={mayRecord}
                  pens={pens}
                  rations={(rations.data ?? []) as RationRow[]}
                />
              </Loaded>
            ),
          },
          {
            value: "items",
            label: t("feed.tab.items"),
            icon: Wheat,
            content: (
              <Loaded query={items}>
                <ItemsTab items={feedItems} />
              </Loaded>
            ),
          },
        ]}
        value={tab}
      />

      {mayRecord ? (
        <ReceiveFeedSheet
          feedItemId={receiving?.feedItemId}
          items={feedItems}
          key={receiving?.feedItemId ?? "any"}
          onOpenChange={(open) => {
            if (!open) {
              setReceiving(null);
            }
          }}
          open={receiving !== null}
        />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/feed")({
  component: FeedPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "stock"
      ? { tab: search.tab as Tab }
      : {},
});
