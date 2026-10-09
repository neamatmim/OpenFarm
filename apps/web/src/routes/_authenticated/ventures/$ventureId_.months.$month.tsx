import { formatDate } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { MonthPicker } from "@/components/months/one-month";
import {
  BackLink,
  Notice,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import {
  PrintTheVentureMonth,
  TheVentureMonth,
  TheVentureMonthAsCsv,
  useVentureMonth,
} from "@/components/ventures/venture-month";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { isAMonth, saidMonth } from "@/lib/months";
import { sayWhy, wordOf } from "@/lib/saying";

/** The refusals this page meets: a month to come, or one the Venture did not run in. */
const REFUSALS = {
  month_not_begun: "months.one.notBegun",
  venture_not_running: "ventures.month.notRunning",
} as const;

/**
 * One month of one Venture, for the Owner: the month beside the run to its end — its animals as they stood, its
 * charges by the Settlement's own lines, its account and Bank Check, the Reimbursement it owes the Farm, each animal sold
 * against her cost, its plan and its Monthly Sums — picked from the months it ran. Its own address, beside the Venture's
 * page rather than inside its tabs.
 */
const VentureMonthPage = () => {
  const { t, language } = useLanguage();
  const { ventureId, month } = Route.useParams();
  const navigate = useNavigate();
  const one = useVentureMonth(ventureId, month, isAMonth(month));
  // A month it did not run in — the Venture page's "this month" for one already settled — goes to its latest.
  const ran = (one.error as { data?: { months?: string[] } } | null)?.data
    ?.months?.[0];
  useEffect(() => {
    if (ran && ran !== month) {
      void navigate({
        params: { ventureId, month: ran },
        replace: true,
        to: "/ventures/$ventureId/months/$month",
      });
    }
  }, [ran, month, navigate, ventureId]);
  const header = (
    <>
      <BackLink params={{ ventureId }} to="/ventures/$ventureId">
        {one.data?.venture.name ?? t("nav.ventures")}
      </BackLink>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {one.data ? (
              <>
                <PrintTheVentureMonth
                  month={month}
                  title={t("ventures.month.title", {
                    venture: one.data.venture.name,
                    month: saidMonth(month, language),
                  })}
                  ventureId={ventureId}
                />
                <TheVentureMonthAsCsv month={month} ventureId={ventureId} />
              </>
            ) : null}
            <MonthPicker
              chosen={month}
              months={one.data?.months ?? []}
              onChoose={(chosen) =>
                navigate({
                  params: { ventureId, month: chosen },
                  to: "/ventures/$ventureId/months/$month",
                })
              }
            />
          </div>
        }
        description={t("ventures.month.subtitle")}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t("ventures.month.title", {
              venture: one.data?.venture.name ?? "",
              month: saidMonth(month, language),
            })}
            {one.data?.soFar ? (
              <StatusBadge tone="info">
                {t("months.one.soFarTo", {
                  day: formatDate(new Date(), language),
                })}
              </StatusBadge>
            ) : null}
          </span>
        }
      />
    </>
  );
  if (!isAMonth(month)) {
    return (
      <Page>
        {header}
        <Notice title={t("months.one.noSuchMonth")} tone="danger" />
      </Page>
    );
  }
  if (!one.data) {
    return (
      <Page>
        {header}
        {one.isError ? (
          <Notice
            title={
              wordOf(one.error) === null
                ? t("common.loadFailed")
                : sayWhy(one.error, t, REFUSALS)
            }
            tone="danger"
          />
        ) : (
          <Skeleton className="h-96 rounded-xl" />
        )}
      </Page>
    );
  }
  return (
    <Page>
      {header}
      <TheVentureMonth one={one.data} />
    </Page>
  );
};

export const Route = createFileRoute(
  "/_authenticated/ventures/$ventureId_/months/$month"
)({
  beforeLoad: onlyFor("owner"),
  component: VentureMonthPage,
});
