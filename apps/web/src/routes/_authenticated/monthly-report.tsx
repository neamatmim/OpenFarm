import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Link, createFileRoute } from "@tanstack/react-router";

import {
  MonthTable,
  NetChart,
  VenturesAgainstPlan,
  YearFigures,
  useByMonth,
} from "@/components/months/by-month";
import { Notice, Page, PageHeader, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { fromTheFirstWithAnything } from "@/lib/months";

/**
 * How the farm has done month by month over the last year, for the Owner: the year in four figures, the Farm's net
 * money a bar a month, every month's figures, and each Venture against its plan. Every figure is one the farm already
 * says on its own page — the accountant's summary, the milk dispatched, Costs by Side, a Venture's plan against
 * actual — read a month at a time.
 */
const MonthsPage = () => {
  const { t } = useLanguage();
  const byMonth = useByMonth();
  const header = (
    <PageHeader description={t("months.subtitle")} title={t("nav.months")} />
  );
  if (!byMonth.data) {
    return (
      <Page>
        {header}
        {byMonth.isError ? (
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
  const { year, ventures } = byMonth.data;
  const months = fromTheFirstWithAnything(byMonth.data.months);
  return (
    <Page>
      {header}
      <YearFigures year={year} />
      <Link
        className="text-sm underline-offset-4 hover:underline"
        to="/returns"
      >
        {t("months.returnsLink")} →
      </Link>
      <Section
        description={t("months.chartHint")}
        title={t("months.chartTitle")}
      >
        <NetChart months={months} />
      </Section>
      <Section
        description={t("months.tableHint")}
        title={t("months.tableTitle")}
      >
        <MonthTable months={months} year={year} />
      </Section>
      <Section
        description={t("months.venturesHint")}
        title={t("months.venturesTitle")}
      >
        <VenturesAgainstPlan ventures={ventures} />
      </Section>
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/monthly-report")({
  beforeLoad: onlyFor("owner"),
  component: MonthsPage,
});
