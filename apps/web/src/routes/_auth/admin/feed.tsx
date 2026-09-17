import { farmDayOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@OpenFarm/ui/components/tabs";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  Coins,
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
import { Page, PageHeader, StatTile } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const TABS = ["stock", "arrivals", "counts", "rations", "items"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICON = {
  stock: Warehouse,
  arrivals: Truck,
  counts: ClipboardList,
  rations: Utensils,
  items: Wheat,
} as const;

/** The four figures the store is judged by: how many Feed Items it holds, how many are Running Low, what it is worth,
 *  and what feed was bought this month. */
const StoreFigures = ({
  lines,
  arrivals,
}: {
  lines: StockLine[];
  arrivals: Arrival[];
}) => {
  const { t, language } = useLanguage();
  const live = lines.filter((line) => !line.retiredAt);
  const short = live.filter((line) => {
    const standing = standingOf(line);
    return standing === "low" || standing === "out";
  }).length;
  const worth = live.reduce((sum, line) => sum + (valueOf(line) ?? 0), 0);
  const month = farmDayOf(new Date()).slice(0, 7);
  const bought = arrivals.filter(
    (one) =>
      one.priceBdt !== null &&
      farmDayOf(new Date(one.receivedOn)).slice(0, 7) === month
  );
  const spent = bought.reduce((sum, one) => sum + (one.priceBdt ?? 0), 0);
  const figures = [
    {
      label: t("feed.kpi.items"),
      value: formatNumber(live.length, language),
      warn: false,
    },
    {
      label: t("feed.kpi.low"),
      value: formatNumber(short, language),
      warn: short > 0,
    },
    {
      label: t("feed.kpi.value"),
      value: `৳${formatNumber(Math.round(worth), language)}`,
      warn: false,
    },
    {
      label: t("feed.kpi.bought"),
      value: `৳${formatNumber(Math.round(spent), language)}`,
      warn: false,
    },
  ];
  return (
    <>
      {/* A phone reads the four figures as one card, so the tabs are still on the first screen. */}
      <dl className="bg-card grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 md:hidden">
        {figures.map((figure) => (
          <div className="flex flex-col gap-0.5" key={figure.label}>
            <dt className="text-muted-foreground text-xs">{figure.label}</dt>
            <dd
              className={cn(
                "text-lg font-semibold tabular-nums",
                figure.warn && "text-warning"
              )}
            >
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="hidden grid-cols-2 gap-4 md:grid xl:grid-cols-4">
        <StatTile
          hint={t("feed.kpi.itemsHint")}
          icon={Warehouse}
          label={t("feed.kpi.items")}
          value={formatNumber(live.length, language)}
        />
        <StatTile
          hint={t("feed.kpi.lowHint")}
          icon={TriangleAlert}
          label={t("feed.kpi.low")}
          tone={short > 0 ? "warning" : "neutral"}
          value={formatNumber(short, language)}
        />
        <StatTile
          hint={t("feed.kpi.valueHint")}
          icon={Coins}
          label={t("feed.kpi.value")}
          value={`৳${formatNumber(Math.round(worth), language)}`}
        />
        <StatTile
          hint={t("feed.kpi.boughtHint", {
            count: formatNumber(bought.length, language),
          })}
          icon={ShoppingCart}
          label={t("feed.kpi.bought")}
          value={`৳${formatNumber(Math.round(spent), language)}`}
        />
      </div>
    </>
  );
};

/**
 * The store and what feeds from it, by what somebody came to do: see what is in the store, look back at what came in
 * or what a count found, put Pens on Rations, or keep the list of Feed Items. Feed coming in is one button away from
 * every tab. The tab is kept in the address, so a page comes back as it was left.
 */
const FeedPage = () => {
  const { t, language } = useLanguage();
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
  const feedItems = (items.data ?? []) as FeedItemRow[];
  const lines = stock.data ?? [];
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );
  const short = lines.filter(
    (line) => !line.retiredAt && ["low", "out"].includes(standingOf(line))
  ).length;
  const counts: Partial<Record<Tab, number>> = {
    stock: short,
  };

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

      <StoreFigures arrivals={arrivals.data ?? []} lines={lines} />

      <Tabs
        className="gap-4"
        onValueChange={(value) =>
          navigate({
            replace: true,
            search: value === "stock" ? {} : { tab: value as Tab },
          })
        }
        value={tab}
      >
        <div className="-mx-4 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
          <TabsList className="h-11 gap-4" variant="line">
            {TABS.map((one) => {
              const Icon = TAB_ICON[one];
              const count = counts[one] ?? 0;
              return (
                <TabsTrigger className="flex-none px-1" key={one} value={one}>
                  <Icon aria-hidden />
                  {t(`feed.tab.${one}`)}
                  {count > 0 ? (
                    <span className="bg-warning/15 text-warning rounded-full px-1.5 text-xs font-semibold tabular-nums">
                      {formatNumber(count, language)}
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="stock">
          <StockTab
            lines={lines}
            mayRecord={mayRecord}
            onReceive={(feedItemId) => setReceiving({ feedItemId })}
          />
        </TabsContent>
        <TabsContent value="arrivals">
          <ArrivalsTab
            arrivals={arrivals.data ?? []}
            items={feedItems}
            mayCorrect={mayRecord}
          />
        </TabsContent>
        <TabsContent value="counts">
          <CountsTab adjustments={adjustments.data ?? []} items={feedItems} />
        </TabsContent>
        <TabsContent value="rations">
          <RationsTab
            items={feedItems}
            mayEdit={mayRecord}
            pens={pens}
            rations={(rations.data ?? []) as RationRow[]}
          />
        </TabsContent>
        <TabsContent value="items">
          <ItemsTab items={feedItems} />
        </TabsContent>
      </Tabs>

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
