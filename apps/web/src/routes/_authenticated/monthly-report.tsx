import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  MonthTable,
  NetChart,
  VenturesAgainstPlan,
  YearFigures,
  YearPicker,
  useByMonth,
} from "@/components/months/by-month";
import { Notice, Page, PageHeader, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { financialYearNamed, fromTheFirstWithAnything } from "@/lib/months";
import { sayWhy, wordOf } from "@/lib/saying";

/** The refusal this page meets: a year asked for in the address that has not begun. */
const REFUSALS = {
  financial_year_not_begun: "months.yearNotBegun",
  no_such_financial_year: "months.noSuchYear",
} as const;

/**
 * How the farm has done month by month, for the Owner: over the last twelve months, or over a financial year picked
 * above them and kept in the address (ADR 0016). The year in four figures, the Farm's net money a bar a month, every
 * month's figures, and each Venture against its plan. Every figure is one the farm already says on its own page — the
 * accountant's summary, the milk dispatched, Costs by Side, a Venture's plan against actual — read a month at a time.
 */
const MonthsPage = () => {
  const { t } = useLanguage();
  const { year: chosen } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const byMonth = useByMonth(chosen);
  const header = (
    <PageHeader
      actions={
        <YearPicker
          chosen={chosen ?? null}
          onChoose={(year) =>
            navigate({ search: year === null ? {} : { year } })
          }
          years={byMonth.data?.financialYears ?? []}
        />
      }
      description={t("months.subtitle")}
      title={t("nav.months")}
    />
  );
  if (!byMonth.data) {
    return (
      <Page>
        {header}
        {byMonth.isError ? (
          <Notice
            title={
              wordOf(byMonth.error) === null
                ? t("common.loadFailed")
                : sayWhy(byMonth.error, t, REFUSALS)
            }
            tone="danger"
          />
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
        description={t(
          months.some((one) => one.soFar)
            ? "months.chartHintSoFar"
            : "months.chartHint"
        )}
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
  // The financial year picked, by the month it begins in; nothing for the last twelve months.
  validateSearch: (search: Record<string, unknown>): { year?: string } => {
    const year = financialYearNamed(search.year);
    return year === undefined ? {} : { year };
  },
  component: MonthsPage,
});
