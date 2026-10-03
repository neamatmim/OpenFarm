import { farmDayOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BookOpen,
  Calculator,
  Coins,
  HandCoins,
  Hourglass,
  PieChart,
  Plus,
  Scale,
} from "lucide-react";
import { useState } from "react";

import { AccountantExport } from "@/components/accountant-export";
import { CostsBySide } from "@/components/costs";
import { EnterMoneySheet } from "@/components/money-entry";
import { CashTab } from "@/components/money/cash-tab";
import { PeriodBar } from "@/components/money/period-bar";
import { ReceivableTab } from "@/components/money/receivable-tab";
import type { MoneyList } from "@/components/money/register";
import { RegisterTab } from "@/components/money/register";
import { WageDrawsTab } from "@/components/money/wage-draws";
import { Notice, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { useMoney } from "@/lib/money";
import { moneyTotals, totalsPartial } from "@/lib/money-totals";
import { useTabOfPath } from "@/lib/path-tabs";
import { orpc } from "@/utils/orpc";

const TABS = [
  "register",
  "cash",
  "draws",
  "receivable",
  "costs",
  "accountant",
] as const;
type Tab = (typeof TABS)[number];

/** Each tab at its own address, the first at the page's own. */
const TAB_PATHS = {
  register: "/money",
  cash: "/money/cash",
  draws: "/money/wage-draws",
  receivable: "/money/receivables",
  costs: "/money/costs",
  accountant: "/money/accountant",
} as const satisfies Record<Tab, string>;

/** The first of this month on the farm's clock, which is where an Owner starts reading money. */
const firstOfTheMonth = () =>
  `${farmDayOf(new Date()).slice(0, "YYYY-MM".length)}-01`;

/** The four figures a period's money is judged by: what came in, what went out, what that leaves, and how much waits
 *  for the Owner — the farm's own totals, from every entry in the period however many the register shows. */
const useMoneyFigures = (list: MoneyList | undefined): Figure[] => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const {
    inMoney: moneyIn,
    outMoney: moneyOut,
    awaiting,
  } = moneyTotals(list ?? { events: [] });
  const net = moneyIn - moneyOut;
  const partial =
    list && totalsPartial(list) ? t("money.shownOnly") : undefined;
  const loading = <Skeleton className="h-8 w-28" />;
  return [
    {
      label: t("money.totalIn"),
      value: list ? asMoney(moneyIn) : loading,
      hint: partial,
      icon: ArrowDownLeft,
      tone: "success",
    },
    {
      label: t("money.totalOut"),
      value: list ? asMoney(moneyOut) : loading,
      hint: partial,
      icon: ArrowUpRight,
    },
    {
      label: t("money.net"),
      value: list ? asMoney(net) : loading,
      hint: partial,
      icon: Scale,
      tone: net < 0 ? "danger" : "neutral",
    },
    {
      label: t("money.awaitingCount"),
      value: list ? formatNumber(awaiting, language) : loading,
      hint: partial,
      icon: Hourglass,
      tone: awaiting > 0 ? "warning" : "neutral",
    },
  ];
};

/**
 * The farm's money in a period, by what somebody came to it for: the register of every taka in and out — and, for the
 * Owner, what waits for their approval — what each Side cost, the accountant's export, and the Categories money is
 * entered under. Money entered by hand is one button away from every tab, and the period above the figures is the one
 * every tab reads. The tab is kept in the address, so a page comes back as it was left.
 */
const MoneyPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = useTabOfPath(TAB_PATHS) ?? "register";
  const me = useQuery(orpc.people.me.queryOptions());
  const [from, setFrom] = useState(firstOfTheMonth);
  const [to, setTo] = useState(() => farmDayOf(new Date()));
  const [entering, setEntering] = useState(false);
  const money = useQuery(orpc.money.list.queryOptions({ input: { from, to } }));
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const entersMoney = isOwner || (me.data?.roles.includes("manager") ?? false);
  const figures = useMoneyFigures(money.data);
  const awaiting = (money.data?.events ?? []).filter(
    (row) => row.approval === "awaiting"
  ).length;

  return (
    <Page>
      <PageHeader
        actions={
          entersMoney ? (
            <Button onClick={() => setEntering(true)} type="button">
              <Plus aria-hidden data-icon="inline-start" />
              {t("byHand.title")}
            </Button>
          ) : null
        }
        description={t("money.subtitle")}
        title={t("nav.money")}
      />

      <div className="flex flex-col gap-4">
        <PeriodBar
          from={from}
          onFromChange={setFrom}
          onToChange={setTo}
          to={to}
        />
        {money.data?.more ? (
          <Notice title={t("money.partialTotals")} tone="info">
            {t("money.partialHint")}
          </Notice>
        ) : null}
        {money.isError ? (
          <Notice
            title={wordedRefusal(money.error, t) ?? t("common.error")}
            tone="danger"
          />
        ) : null}
        <SummaryFigures figures={figures} />
      </div>

      <PageTabs
        onChange={(value) => navigate({ replace: true, to: TAB_PATHS[value] })}
        tabs={[
          {
            value: "register",
            label: t("money.register"),
            icon: BookOpen,
            // Money waiting is the Owner's to approve, so it asks for their attention alone.
            count: isOwner ? awaiting : undefined,
            content: (
              <RegisterTab
                entersMoney={entersMoney}
                isOwner={isOwner}
                money={money}
              />
            ),
          },
          {
            value: "cash",
            label: t("cash.tab"),
            icon: Banknote,
            content: <CashTab isOwner={isOwner} myId={me.data?.id} />,
          },
          {
            value: "draws",
            label: t("wageDraw.tab"),
            icon: Coins,
            content: <WageDrawsTab />,
          },
          {
            value: "receivable",
            label: t("receivable.tab"),
            icon: HandCoins,
            content: <ReceivableTab />,
          },
          {
            value: "costs",
            label: t("costs.bySide"),
            icon: PieChart,
            content: <CostsBySide from={from} to={to} />,
          },
          {
            value: "accountant",
            label: t("accountant.title"),
            icon: Calculator,
            content: <AccountantExport from={from} to={to} />,
          },
        ]}
        value={tab}
      />

      {entersMoney ? (
        <EnterMoneySheet onOpenChange={setEntering} open={entering} />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/money")({
  beforeLoad: ({ context }) => {
    // Barn Staff never see money, and the Vet's is on the Vet's own screen.
    const { roles } = context.me;
    if (!(roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/" });
    }
  },
  component: MoneyPage,
});
