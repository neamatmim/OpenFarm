import { formatDate } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  TheMonthAsCsv,
  LeftOut,
  MoneyBy,
  MonthPart,
  MonthPicker,
  PrintTheMonth,
  SideResults,
  VenturesThatRan,
  useMonthLines,
  useOneMonth,
} from "@/components/months/one-month";
import type { KeptFigures, OneMonth } from "@/components/months/one-month";
import {
  BackLink,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { financialYearNamed, isAMonth, saidMonth } from "@/lib/months";
import { sayWhy, wordOf } from "@/lib/saying";

/** The refusal this page meets: a month in the address that has not begun. */
const REFUSALS = { month_not_begun: "months.one.notBegun" } as const;

/** The month's parts, once its figures are here: money, the dairy, the fattening side, the overheads, what each Side
 *  came to after them, what they leave out, and the Ventures that kept their own accounts beside it. */
const TheMonth = ({ one }: { one: OneMonth }) => {
  const { t, language } = useLanguage();
  const lines = useMonthLines(one.figures, one.figuresBefore);
  // An answer kept on the phone from before the management figures holds none of them: drawn without those parts.
  const kept: KeptFigures = one.figures;
  const at = { month: one.month, before: one.before };
  return (
    <>
      <Section
        description={t("months.one.moneyHint")}
        title={t("months.one.money")}
      >
        <MonthPart {...at} lines={lines.money} />
        <div className="grid gap-6 lg:grid-cols-2">
          <MoneyBy
            heading={t("months.one.byCategory")}
            rows={one.moneyBy.category.map((row) => ({
              key: row.nameBn,
              name: language === "en" ? (row.nameEn ?? row.nameBn) : row.nameBn,
              inMoney: row.inMoney,
              outMoney: row.outMoney,
            }))}
          />
          <MoneyBy
            heading={t("months.one.bySide")}
            rows={one.moneyBy.side.map((row) => ({
              key: row.side ?? "farm",
              name:
                row.side === null
                  ? t("months.one.wholeFarm")
                  : t(`animals.side.${row.side}`),
              inMoney: row.inMoney,
              outMoney: row.outMoney,
            }))}
          />
        </div>
      </Section>
      <Section
        description={t("months.one.dairyHint")}
        title={t("months.one.dairy")}
      >
        <MonthPart {...at} lines={lines.dairy} />
      </Section>
      <Section
        description={t("months.one.fatteningHint")}
        title={t("months.one.fattening")}
      >
        <MonthPart {...at} lines={lines.fattening} />
      </Section>
      <Section
        description={t("months.one.overheadsHint")}
        title={t("months.one.overheads")}
      >
        <MonthPart {...at} lines={lines.overheads} />
      </Section>
      {kept.results ? (
        <Section
          description={t("months.one.resultsHint")}
          title={t("months.one.results")}
        >
          <SideResults results={kept.results} />
        </Section>
      ) : null}
      {kept.cashFlow ? (
        <Section
          description={t("months.one.cashFlowHint")}
          title={t("months.one.cashFlow")}
        >
          <MonthPart {...at} lines={lines.cashFlow} />
        </Section>
      ) : null}
      {kept.atEnd ? (
        <Section
          description={t("months.one.cashHint")}
          title={t("months.one.cash")}
        >
          <MonthPart {...at} lines={lines.cash} />
        </Section>
      ) : null}
      {kept.atEnd ? (
        <Section
          description={t("months.one.receivablesHint")}
          title={t("months.one.receivables")}
        >
          <MonthPart {...at} lines={lines.receivables} />
        </Section>
      ) : null}
      {kept.atEnd ? (
        <Section
          description={t("months.one.storeHint")}
          title={t("months.one.store")}
        >
          <MonthPart {...at} lines={lines.store} />
        </Section>
      ) : null}
      {kept.atEnd ? (
        <Section
          description={t("months.one.capitalHint")}
          title={t("months.one.capital")}
        >
          <MonthPart {...at} lines={lines.capital} />
        </Section>
      ) : null}
      {kept.monthsReturn ? (
        <Section
          description={t("months.one.monthsReturnHint")}
          title={t("months.one.monthsReturn")}
        >
          <MonthPart {...at} lines={lines.monthsReturn} />
        </Section>
      ) : null}
      <LeftOut figures={one.figures} />
      <Section title={t("months.one.venturesTitle")}>
        <VenturesThatRan month={one.month} ventures={one.ventures} />
      </Section>
    </>
  );
};

/**
 * One month of the farm, for the Owner: the monthly report's figures for it beside the month before's — the Farm's own
 * money, by Category and by Side as the accountant adds it, the dairy, the fattening side and the overheads — what they
 * leave out, and the Ventures that ran in it, each keeping its own accounts. Picked from the months the farm has kept.
 */
const MonthPage = () => {
  const { t, language } = useLanguage();
  const { month } = Route.useParams();
  // The financial year the report was read in, so going back finds it as it was left.
  const { year } = Route.useSearch();
  const navigate = useNavigate();
  const one = useOneMonth(month, isAMonth(month));
  const header = (
    <>
      <BackLink
        search={year === undefined ? {} : { year }}
        to="/monthly-report"
      >
        {t("nav.months")}
      </BackLink>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {one.data ? (
              <>
                <PrintTheMonth month={month} />
                <TheMonthAsCsv month={month} />
              </>
            ) : null}
            <MonthPicker
              chosen={month}
              months={one.data?.monthsKept ?? []}
              onChoose={(chosen) =>
                navigate({
                  params: { month: chosen },
                  search: year === undefined ? {} : { year },
                  to: "/monthly-report/$month",
                })
              }
            />
          </div>
        }

        description={t("months.one.subtitle")}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t("months.one.title", { month: saidMonth(month, language) })}
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
      <TheMonth one={one.data} />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/monthly-report/$month")({
  beforeLoad: onlyFor("owner"),
  // The financial year the report was read in, carried there and back; nothing for the last twelve months.
  validateSearch: (search: Record<string, unknown>): { year?: string } => {
    const year = financialYearNamed(search.year);
    return year === undefined ? {} : { year };
  },
  component: MonthPage,
});
