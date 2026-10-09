import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { Beef, Briefcase, Milk, Receipt, Scale } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import { EmptyState, Notice, StatusBadge } from "@/components/page";
import { NativeSelect, SummaryFigures } from "@/components/page-kit";
import { StateBadge } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import {
  usePercent,
  usePerHeadPerDay,
  useMoney,
  useMoneyRate,
} from "@/lib/money";
import { financialYearName, saidMonth } from "@/lib/months";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

export type ByMonth = Awaited<ReturnType<typeof client.monthlyReport.get>>;
type Month = ByMonth["months"][number];
type Stretch = ByMonth["year"];
type VentureAgainstPlan = ByMonth["ventures"][number];

/** The farm month by month, the Owner's alone: the last twelve months, or the financial year asked for by the month
 *  it begins in. The months already drawn stay while another year's are asked for, so the page does not empty and
 *  refill. */
export const useByMonth = (financialYear?: string) =>
  useQuery({
    ...orpc.monthlyReport.get.queryOptions({
      input: financialYear === undefined ? {} : { financialYear },
    }),
    placeholderData: keepPreviousData,
  });

type FinancialYear = ByMonth["financialYears"][number];

const isAYear = (year: unknown): year is FinancialYear =>
  typeof year === "object" && year !== null && "start" in year;

/**
 * Which months the report reads: the last twelve, or one of the financial years the farm has kept money in, this one
 * so far, each named with its length where it is not twelve months. The phone's own picker, as the list grows a year
 * at a time.
 */
export const YearPicker = ({
  years: given,
  chosen,
  onChoose,
}: {
  years: readonly FinancialYear[];
  chosen: string | null;
  onChoose: (start: string | null) => void;
}) => {
  const { t, language } = useLanguage();
  // A phone's kept answer from before years were named by their months held them as bare numbers: drawn first, it
  // offers none of them rather than failing, and the farm's answer brings them a moment later.
  const years = given.filter(isAYear);
  const [thisYear] = years;
  const listed = years.some((year) => year.start === chosen);
  return (
    <NativeSelect
      aria-label={t("months.whichYear")}
      className="sm:w-64"
      onChange={(event) =>
        onChoose(event.target.value === "" ? null : event.target.value)
      }
      value={chosen ?? ""}
    >
      <option value="">{t("months.lastTwelve")}</option>
      {/* A year asked for in the address that the farm does not list is still offered, so the picker says what is
          shown. */}
      {chosen !== null && !listed ? (
        <option value={chosen}>{chosen}</option>
      ) : null}
      {years.map((year) => (
        <option key={year.start} value={year.start}>
          {t(
            year.start === thisYear?.start
              ? "months.financialYearSoFar"
              : "months.financialYear",
            { year: financialYearName(year, t, language) }
          )}
        </option>
      ))}
    </NativeSelect>
  );
};

/** The year in four figures: what the Farm's own money came to, the milk sold beside what the dairy cows cost, and the
 *  Margins on the fattening animals sold. */
export const YearFigures = ({ year }: { year: Stretch }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const perLiter = useMoneyRate();
  const { money, dairy, fattening } = year;
  return (
    <SummaryFigures
      figures={[
        {
          label: t("months.net"),
          value: asMoney(money.netMoney),
          hint: t("owner.inAndOut", {
            in: asMoney(money.inMoney),
            out: asMoney(money.outMoney),
          }),
          icon: Scale,
          tone: money.netMoney < 0 ? "danger" : "neutral",
          lead: true,
        },
        {
          label: t("months.milkSold"),
          value: asMoney(dairy.milkSoldMoney),
          hint:
            dairy.fetchedPerLiterMoney === null
              ? undefined
              : t("months.milkSoldHint", {
                  liters: formatNumber(dairy.litersSold, language),
                  fetched: perLiter(dairy.fetchedPerLiterMoney),
                }),
          icon: Milk,
        },
        {
          label: t("months.dairyCost"),
          value: asMoney(dairy.chargedMoney),
          hint:
            dairy.costPerLiterMoney === null
              ? undefined
              : t("months.dairyCostHint", {
                  perLiter: perLiter(dairy.costPerLiterMoney),
                }),
          icon: Receipt,
        },
        {
          label: t("months.margins"),
          value:
            fattening.marginMoney === null
              ? t("months.nothingYet")
              : asMoney(fattening.marginMoney),
          hint: t("months.marginsHint", { count: fattening.sold }),
          icon: Beef,
          tone: (fattening.marginMoney ?? 0) < 0 ? "danger" : "neutral",
        },
      ]}
    />
  );
};

/** A month's name short, as it stands under its bar. */
const shortMonth = (
  month: string,
  language: Parameters<typeof formatDate>[1]
) => formatDate(startOfFarmDay(`${month}-01`), language, "monthShort");

/**
 * The Farm's own money in less money out, a bar a month, oldest on the left: one hue, above nought for a month that
 * made money and below it for one that lost, so the sign is where the bar stands rather than what color it is. This
 * month is the darker bar, as today is in the milk's week, and is only so far. Each bar says its month and figure to a
 * finger or a pointer resting on its column and to a screen reader; the table below has every figure.
 */
export const NetChart = ({ months }: { months: Month[] }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const nets = months.map((one) => one.money.netMoney);
  const up = Math.max(0, ...nets);
  const down = Math.max(0, ...nets.map((net) => -net));
  const span = up + down;
  // Where nought runs across, from the top: at the foot when no month lost money.
  const zeroAt = span === 0 ? 100 : (up / span) * 100;
  const columns = {
    gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`,
  };
  const [widest] = [asMoney(up), asMoney(-down)].toSorted(
    (a, b) => b.length - a.length
  );
  return (
    <div className="flex gap-2 py-2">
      <div
        aria-hidden
        className="text-muted-foreground relative h-40 shrink-0 text-end text-xs tabular-nums"
      >
        <span className="invisible block">{widest}</span>
        {up > 0 ? (
          <span className="absolute end-0 top-0 -translate-y-1/2">
            {asMoney(up)}
          </span>
        ) : null}
        <span
          className="absolute end-0 -translate-y-1/2"
          style={{ top: `${zeroAt}%` }}
        >
          {formatNumber(0, language)}
        </span>
        {down > 0 ? (
          <span className="absolute end-0 top-full -translate-y-1/2">
            {asMoney(-down)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="relative h-40">
          <span
            aria-hidden
            className="bg-border absolute inset-x-0 h-px"
            style={{ top: `${zeroAt}%` }}
          />
          <ol className="absolute inset-0 grid gap-1" style={columns}>
            {months.map((one) => {
              const net = one.money.netMoney;
              const said = t("months.chartSaid", {
                month: saidMonth(one.month, language),
                net: asMoney(net),
              });
              const height = `max(${span === 0 ? 0 : (Math.abs(net) / span) * 100}%, 2px)`;
              return (
                <li className="relative" key={one.month} title={said}>
                  <span className="sr-only">{said}</span>
                  {net === 0 ? null : (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-1/2 w-full max-w-6 -translate-x-1/2",
                        net > 0 ? "rounded-t-[4px]" : "rounded-b-[4px]",
                        one.soFar ? "bg-primary" : "bg-primary/45"
                      )}
                      style={
                        net > 0
                          ? { bottom: `${100 - zeroAt}%`, height }
                          : { top: `${zeroAt}%`, height }
                      }
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <ol aria-hidden className="grid gap-1" style={columns}>
          {months.map((one, index) => (
            <li
              className={cn(
                // On a phone a month's name may spill into the unnamed month beside it rather than be cut to "জানু…".
                "text-muted-foreground text-center text-xs whitespace-nowrap sm:truncate",
                one.soFar && "text-primary font-semibold",
                // On a phone every other month is named, this one always among them.
                (months.length - 1 - index) % 2 === 1 && "max-sm:invisible"
              )}
              key={one.month}
            >
              {shortMonth(one.month, language)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

interface MonthCell {
  row: { original: Month };
}

/** The month by name, leading to the month on its own: the table's row and the phone's card alike. */
const MonthName = ({ month }: { month: Month }) => {
  const { t, language } = useLanguage();
  // The financial year being read, carried to the month so going back finds it again.
  const { year } = useSearch({ strict: false });
  return (
    <span className="flex flex-wrap items-center gap-2 font-medium">
      <Link
        className="underline-offset-4 hover:underline"
        params={{ month: month.month }}
        search={year === undefined ? {} : { year }}
        to="/monthly-report/$month"
      >
        {saidMonth(month.month, language)}
      </Link>
      {month.soFar ? (
        <StatusBadge tone="info">{t("months.soFar")}</StatusBadge>
      ) : null}
    </span>
  );
};

const MonthNameCell = ({ row }: MonthCell) => (
  <MonthName month={row.original} />
);

/** A sum in a column: in figures of one width, so a column of them lines up. */
const Sum = ({ amount }: { amount: number }) => {
  const asMoney = useMoney();
  return <span className="tabular-nums">{asMoney(amount)}</span>;
};

const InCell = ({ row }: MonthCell) => (
  <Sum amount={row.original.money.inMoney} />
);
const OutCell = ({ row }: MonthCell) => (
  <Sum amount={row.original.money.outMoney} />
);
const NetCell = ({ row }: MonthCell) => (
  <span
    className={cn(
      "font-medium",
      row.original.money.netMoney < 0 && "text-danger"
    )}
  >
    <Sum amount={row.original.money.netMoney} />
  </span>
);
const MilkCell = ({ row }: MonthCell) => (
  <Sum amount={row.original.dairy.milkSoldMoney} />
);
const DairyCostCell = ({ row }: MonthCell) => (
  <Sum amount={row.original.dairy.chargedMoney} />
);

/** What a liter fetched beside what it cost: either may be nothing, where no milk left or none went to Bulk. */
const LiterCell = ({ row }: MonthCell) => {
  const { t } = useLanguage();
  const perLiter = useMoneyRate();
  const { fetchedPerLiterMoney, costPerLiterMoney } = row.original.dairy;
  if (fetchedPerLiterMoney === null && costPerLiterMoney === null) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("months.pair", {
        first:
          fetchedPerLiterMoney === null ? "—" : perLiter(fetchedPerLiterMoney),
        second: costPerLiterMoney === null ? "—" : perLiter(costPerLiterMoney),
      })}
    </span>
  );
};

/** Liters to Bulk for each cow milked, a day; nothing where none went, or a phone's copy from before it was said. */
const PerCowCell = ({ row }: MonthCell) => {
  const { t, language } = useLanguage();
  const liters = row.original.dairy.litersPerCowMilked;
  if (liters === null || liters === undefined) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("owner.liters", { liters: formatNumber(liters, language) })}
    </span>
  );
};

const SoldCell = ({ row }: MonthCell) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const { sold, marginMoney } = row.original.fattening;
  if (marginMoney === null) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("months.pair", {
        first: formatNumber(sold, language),
        second: asMoney(marginMoney),
      })}
    </span>
  );
};

const FatteningCostCell = ({ row }: MonthCell) => (
  <Sum amount={row.original.fattening.chargedMoney} />
);

/** What running the place cost in the month beside what that came to a head a day — missing from an answer a phone
 *  kept from before there were Overheads. */
const OverheadsCell = ({ row }: MonthCell) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const perHead = usePerHeadPerDay();
  const { overheads } = row.original;
  if (!overheads) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("months.pair", {
        first: asMoney(overheads.amount),
        second: perHead(overheads.perHeadPerDayMoney),
      })}
    </span>
  );
};

/** What the month came to after the overheads, and its margin — missing from an answer a phone kept from before the
 *  management figures (ADR 0023). */
const AfterOverheadsCell = ({ row }: MonthCell) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const percent = usePercent();
  const { results } = row.original;
  if (!results) {
    return <Nothing />;
  }
  const { afterOverheadsMoney, marginAfterPercent } = results.farm;
  return (
    <span className="tabular-nums">
      {marginAfterPercent === null
        ? asMoney(afterOverheadsMoney)
        : t("months.pair", {
            first: asMoney(afterOverheadsMoney),
            second: percent(marginAfterPercent),
          })}
    </span>
  );
};

const column = createListColumns<Month>();
const monthColumns = column.columns([
  column.accessor("month", {
    header: listHeader("months.col.month"),
    cell: MonthNameCell,
    // Pinned as the year scrolls sideways at a laptop's width, so every figure still says which month it is.
    meta: { className: "bg-card sticky left-0 z-[1]" },
  }),
  column.accessor((row) => row.money.inMoney, {
    id: "in",
    header: listHeader("money.totalIn"),
    cell: InCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.money.outMoney, {
    id: "out",
    header: listHeader("money.totalOut"),
    cell: OutCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.money.netMoney, {
    id: "net",
    header: listHeader("money.net"),
    cell: NetCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.dairy.milkSoldMoney, {
    id: "milk",
    header: listHeader("months.col.milk"),
    cell: MilkCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.dairy.chargedMoney, {
    id: "dairyCost",
    header: listHeader("months.col.dairyCost"),
    cell: DairyCostCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.dairy.fetchedPerLiterMoney ?? undefined, {
    id: "liter",
    header: listHeader("months.col.liter"),
    cell: LiterCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.dairy.litersPerCowMilked ?? undefined, {
    id: "perCow",
    header: listHeader("months.col.perCow"),
    cell: PerCowCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.fattening.marginMoney ?? undefined, {
    id: "sold",
    header: listHeader("months.col.sold"),
    cell: SoldCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.fattening.chargedMoney, {
    id: "fatteningCost",
    header: listHeader("months.col.fatteningCost"),
    cell: FatteningCostCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.overheads?.amount, {
    id: "overheads",
    header: listHeader("months.col.overheads"),
    cell: OverheadsCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.results?.farm.afterOverheadsMoney, {
    id: "afterOverheads",
    header: listHeader("months.col.afterOverheads"),
    cell: AfterOverheadsCell,
    meta: { align: "end" },
  }),
]);

/** A month on a phone: its name and net on top, then its money, its milk and its fattening, each a line of words. */
const MonthCard = ({ month }: { month: Month }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const perLiter = useMoneyRate();
  const perHead = usePerHeadPerDay();
  const { money, dairy, fattening } = month;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <MonthName month={month} />
        <span
          className={cn(
            "font-semibold tabular-nums",
            money.netMoney < 0 && "text-danger"
          )}
        >
          {asMoney(money.netMoney)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {t("owner.inAndOut", {
          in: asMoney(money.inMoney),
          out: asMoney(money.outMoney),
        })}
      </p>
      <p className="text-sm">
        {t("months.cardMilk", {
          sold: asMoney(dairy.milkSoldMoney),
          cost: asMoney(dairy.chargedMoney),
        })}
      </p>
      {dairy.fetchedPerLiterMoney !== null &&
      dairy.costPerLiterMoney !== null ? (
        <p className="text-muted-foreground text-sm">
          {t("months.cardLiter", {
            fetched: perLiter(dairy.fetchedPerLiterMoney),
            cost: perLiter(dairy.costPerLiterMoney),
          })}
        </p>
      ) : null}
      <p className="text-sm">
        {fattening.marginMoney === null
          ? t("months.cardNoneSold", { cost: asMoney(fattening.chargedMoney) })
          : t("months.cardSold", {
              count: fattening.sold,
              margin: asMoney(fattening.marginMoney),
              cost: asMoney(fattening.chargedMoney),
            })}
      </p>
      {month.overheads ? (
        <p className="text-muted-foreground text-sm">
          {t("months.cardOverheads", {
            amount: asMoney(month.overheads.amount),
            perHead: perHead(month.overheads.perHeadPerDayMoney),
          })}
        </p>
      ) : null}
    </div>
  );
};

const monthCard = (month: Month) => <MonthCard month={month} />;

/**
 * Each month, the newest first: the Farm's money in and out, the milk sold beside what the dairy cows cost and a liter
 * of each, and the fattening animals sold with their Margins beside what the fattening side cost. Below it, what the
 * figures hold that a reader would not guess: money not yet approved, and feed or doses the farm put no price on.
 */
export const MonthTable = ({
  months,
  year,
}: {
  months: Month[];
  year: Stretch;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const perHead = usePerHeadPerDay();
  const newestFirst = months.toReversed();
  const table = useListTable({
    columns: monthColumns,
    data: newestFirst,
    getRowId: (row) => row.month,
  });
  const unpricedKg = year.dairy.unpricedKg + year.fattening.unpricedKg;
  const uncostedDoses = year.dairy.uncostedDoses + year.fattening.uncostedDoses;
  return (
    <div className="flex flex-col gap-3">
      <DataTable card={monthCard} minWidth="72rem" table={table} />
      {year.overheads ? (
        <p className="text-muted-foreground text-sm">
          {t("months.yearOverheads", {
            amount: asMoney(year.overheads.amount),
            perHead: perHead(year.overheads.perHeadPerDayMoney),
          })}
        </p>
      ) : null}
      {year.money.awaitingCount > 0 ? (
        <Notice title={t("months.awaiting")} tone="info" />
      ) : null}
      {unpricedKg > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("costs.unpricedNote", { amount: unpricedKg })}
        </p>
      ) : null}
      {uncostedDoses > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("costs.uncostedNote", { amount: uncostedDoses })}
        </p>
      ) : null}
    </div>
  );
};

/** One Venture against its plan: its name and where it stands, what its plan said, and what it comes to now. */
const VentureLine = ({ venture }: { venture: VentureAgainstPlan }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const range = (between: { lowMoney: number; highMoney: number }) =>
    t("projection.range", {
      low: asMoney(between.lowMoney),
      high: asMoney(between.highMoney),
    });
  const now = (() => {
    if (venture.settledProfitMoney !== null) {
      return t("months.made", { profit: asMoney(venture.settledProfitMoney) });
    }
    if (venture.projected) {
      return t("months.projectedNow", { range: range(venture.projected) });
    }
    return venture.planned ? t("months.nothingProjected") : null;
  })();
  return (
    <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="font-medium underline-offset-4 hover:underline"
          params={{ ventureId: venture.id }}
          to="/ventures/$ventureId"
        >
          {venture.name}
        </Link>
        <StateBadge state={venture.state} />
      </div>
      <div className="flex flex-col gap-0.5 text-sm tabular-nums sm:items-end">
        <span className="text-muted-foreground">
          {venture.planned
            ? t("months.planned", { range: range(venture.planned) })
            : t("months.noPlan")}
        </span>
        {now ? <span className="font-medium">{now}</span> : null}
      </div>
    </li>
  );
};

interface VentureCell {
  row: { original: VentureAgainstPlan };
}

/** A low-to-high range of profit, in the reader's words. */
const useRange = () => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (between: { lowMoney: number; highMoney: number }) =>
    t("projection.range", {
      low: asMoney(between.lowMoney),
      high: asMoney(between.highMoney),
    });
};

const VentureNameCell = ({ row }: VentureCell) => (
  <span className="flex flex-wrap items-center gap-2">
    <Link
      className="font-medium underline-offset-4 hover:underline"
      params={{ ventureId: row.original.id }}
      to="/ventures/$ventureId"
    >
      {row.original.name}
    </Link>
    <StateBadge state={row.original.state} />
  </span>
);
const VenturePlannedCell = ({ row }: VentureCell) => {
  const { t } = useLanguage();
  const range = useRange();
  const { planned } = row.original;
  return planned ? (
    <span>{range(planned)}</span>
  ) : (
    <span className="text-muted-foreground">{t("months.noPlan")}</span>
  );
};
const VentureNowCell = ({ row }: VentureCell) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const range = useRange();
  const venture = row.original;
  if (venture.settledProfitMoney !== null) {
    return (
      <span className="font-medium">
        {t("months.made", { profit: asMoney(venture.settledProfitMoney) })}
      </span>
    );
  }
  if (venture.projected) {
    return <span className="font-medium">{range(venture.projected)}</span>;
  }
  return <Nothing />;
};

const ventureColumn = createListColumns<VentureAgainstPlan>();
const ventureColumns = ventureColumn.columns([
  ventureColumn.accessor("name", {
    header: listHeader("months.col.venture"),
    cell: VentureNameCell,
  }),
  ventureColumn.accessor((venture) => venture.planned?.lowMoney, {
    id: "planned",
    header: listHeader("months.col.planned"),
    cell: VenturePlannedCell,
    meta: { align: "end" },
  }),
  ventureColumn.accessor(
    (venture) => venture.settledProfitMoney ?? venture.projected?.lowMoney,
    {
      id: "now",
      header: listHeader("months.col.now"),
      cell: VentureNowCell,
      meta: { align: "end" },
    }
  ),
]);

/** On a desk, each Venture a row against its plan: the plan's range beside what it comes to now, made or projected
 *  (Polaris's index table), oldest first as the report reads. */
const VenturesTable = ({ ventures }: { ventures: VentureAgainstPlan[] }) => {
  const table = useListTable({
    columns: ventureColumns,
    data: ventures,
    getRowId: (venture) => venture.id,
  });
  return <DataTable table={table} />;
};

/** Each Venture that was not called off, oldest first, against the plan it opened on. */
export const VenturesAgainstPlan = ({
  ventures,
}: {
  ventures: VentureAgainstPlan[];
}) => {
  const { t } = useLanguage();
  if (ventures.length === 0) {
    return <EmptyState bare icon={Briefcase} title={t("months.noVentures")} />;
  }
  return (
    <>
      <ul className="divide-border flex flex-col divide-y md:hidden">
        {ventures.map((venture) => (
          <VentureLine key={venture.id} venture={venture} />
        ))}
      </ul>
      <div className="hidden md:block">
        <VenturesTable ventures={ventures} />
      </div>
    </>
  );
};
