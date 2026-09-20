import { farmDayOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Calculator,
  Hourglass,
  PieChart,
  Plus,
  Scale,
  Tags,
} from "lucide-react";
import { useState } from "react";

import { AccountantExport } from "@/components/accountant-export";
import { CostsBySide } from "@/components/costs";
import { EnterMoneySheet } from "@/components/money-entry";
import { CategoriesTab } from "@/components/money/categories-tab";
import { PeriodBar } from "@/components/money/period-bar";
import type { MoneyList } from "@/components/money/register";
import { RegisterTab } from "@/components/money/register";
import { Notice, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

const TABS = ["register", "costs", "accountant", "categories"] as const;
type Tab = (typeof TABS)[number];

/** The first of this month on the farm's clock, which is where an Owner starts reading money. */
const firstOfTheMonth = () =>
  `${farmDayOf(new Date()).slice(0, "YYYY-MM".length)}-01`;

/** The four figures a period's money is judged by: what came in, what went out, what that leaves, and how much waits
 *  for the Owner. Totals from a list the server cut short are the shown rows' totals, and say so on every figure. */
const useMoneyFigures = (list: MoneyList | undefined): Figure[] => {
  const { t, language } = useLanguage();
  const rows = list?.events ?? [];
  const taka = useTaka();
  const moneyIn = rows
    .filter((row) => row.direction === "in")
    .reduce((sum, row) => sum + row.amountBdt, 0);
  const moneyOut = rows
    .filter((row) => row.direction === "out")
    .reduce((sum, row) => sum + row.amountBdt, 0);
  const net = moneyIn - moneyOut;
  const awaiting = rows.filter((row) => row.approval === "awaiting").length;
  const partial = list?.more ? t("money.shownOnly") : undefined;
  const loading = <Skeleton className="h-8 w-28" />;
  return [
    {
      label: t("money.totalIn"),
      value: list ? taka(moneyIn) : loading,
      hint: partial,
      icon: ArrowDownLeft,
      tone: "success",
    },
    {
      label: t("money.totalOut"),
      value: list ? taka(moneyOut) : loading,
      hint: partial,
      icon: ArrowUpRight,
    },
    {
      label: t("money.net"),
      value: list ? `${net < 0 ? "−" : ""}${taka(Math.abs(net))}` : loading,
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
  const { tab = "register" } = Route.useSearch();
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
    <Page width="wide">
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
        title={t("money.title")}
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
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "register" ? {} : { tab: value },
          })
        }
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
          {
            value: "categories",
            label: t("byHand.categories"),
            icon: Tags,
            content: <CategoriesTab />,
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

export const Route = createFileRoute("/_auth/money")({
  beforeLoad: ({ context }) => {
    // Barn Staff never see money, and the Vet's is on the Vet's own screen.
    const { roles } = context.me;
    if (!(roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: MoneyPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "register"
      ? { tab: search.tab as Tab }
      : {},
});
