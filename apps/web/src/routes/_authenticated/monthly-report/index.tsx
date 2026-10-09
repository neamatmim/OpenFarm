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
import {
  Notice,
  Page,
  PageHeader,
  Section,
  SUBHEADING,
} from "@/components/page";
import {
  FinishedReturns,
  StillGoing,
  useReturns,
} from "@/components/returns/returns-page";
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
      <ReturnsToday />
    </Page>
  );
};

/**
 * Return on Cost beside the months, as it stands today (ADR 0023): every Season and Venture whose last animal has gone,
 * and every one still going at today's prices — a whole run's figure, never a month's — as the Returns page reads them.
 */
const ReturnsToday = () => {
  const { t } = useLanguage();
  const returns = useReturns();
  if (!returns.data) {
    return null;
  }
  const page = returns.data;
  return (
    <Section
      description={t("months.returnsHint")}
      title={t("months.returnsTitle")}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h3 className={SUBHEADING}>{t("returns.finishedTitle")}</h3>
          <FinishedReturns page={page} />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className={SUBHEADING}>{t("returns.stillGoingTitle")}</h3>
          <StillGoing page={page} />
        </div>
        <Link
          className="self-start text-sm underline-offset-4 hover:underline"
          to="/returns"
        >
          {t("returns.seeAll")} →
        </Link>
      </div>
    </Section>
  );
};

export const Route = createFileRoute("/_authenticated/monthly-report/")({
  beforeLoad: onlyFor("owner"),
  // The financial year picked, by the month it begins in; nothing for the last twelve months.
  validateSearch: (search: Record<string, unknown>): { year?: string } => {
    const year = financialYearNamed(search.year);
    return year === undefined ? {} : { year };
  },
  component: MonthsPage,
});
