import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Beef, Briefcase, Milk, Receipt, Scale } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import { EmptyState, Notice, StatusBadge } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { StateBadge } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { saidMonth } from "@/lib/months";
import { usePerHeadPerDay, useTaka, useTakaToThePaisa } from "@/lib/taka";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

export type ByMonth = Awaited<ReturnType<typeof client.home.byMonth>>;
type Month = ByMonth["months"][number];
type Stretch = ByMonth["year"];
type VentureAgainstPlan = ByMonth["ventures"][number];

/** The farm month by month, the Owner's alone. */
export const useByMonth = () => useQuery(orpc.home.byMonth.queryOptions());

/** The year in four figures: what the Farm's own money came to, the milk sold beside what the dairy cows cost, and the
 *  Margins on the fattening animals sold. */
export const YearFigures = ({ year }: { year: Stretch }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const perLitre = useTakaToThePaisa();
  const { money, dairy, fattening } = year;
  return (
    <SummaryFigures
      figures={[
        {
          label: t("months.net"),
          value: taka(money.netMoney),
          hint: t("owner.inAndOut", {
            in: taka(money.inMoney),
            out: taka(money.outMoney),
          }),
          icon: Scale,
          tone: money.netMoney < 0 ? "danger" : "neutral",
          lead: true,
        },
        {
          label: t("months.milkSold"),
          value: taka(dairy.milkSoldMoney),
          hint:
            dairy.fetchedPerLitreMoney === null
              ? undefined
              : t("months.milkSoldHint", {
                  litres: formatNumber(dairy.litresSold, language),
                  fetched: perLitre(dairy.fetchedPerLitreMoney),
                }),
          icon: Milk,
        },
        {
          label: t("months.dairyCost"),
          value: taka(dairy.chargedMoney),
          hint:
            dairy.costPerLitreMoney === null
              ? undefined
              : t("months.dairyCostHint", {
                  perLitre: perLitre(dairy.costPerLitreMoney),
                }),
          icon: Receipt,
        },
        {
          label: t("months.margins"),
          value:
            fattening.marginMoney === null
              ? t("months.nothingYet")
              : taka(fattening.marginMoney),
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
 * made money and below it for one that lost, so the sign is where the bar stands rather than what colour it is. This
 * month is the darker bar, as today is in the milk's week, and is only so far. Each bar says its month and figure to a
 * finger or a pointer resting on its column and to a screen reader; the table below has every figure.
 */
export const NetChart = ({ months }: { months: Month[] }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const nets = months.map((one) => one.money.netMoney);
  const up = Math.max(0, ...nets);
  const down = Math.max(0, ...nets.map((net) => -net));
  const span = up + down;
  // Where nought runs across, from the top: at the foot when no month lost money.
  const zeroAt = span === 0 ? 100 : (up / span) * 100;
  const columns = {
    gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`,
  };
  const [widest] = [taka(up), taka(-down)].toSorted(
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
            {taka(up)}
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
            {taka(-down)}
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
                net: taka(net),
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
                "text-muted-foreground truncate text-center text-xs",
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

const MonthName = ({ month }: { month: Month }) => {
  const { t, language } = useLanguage();
  return (
    <span className="flex flex-wrap items-center gap-2 font-medium">
      {saidMonth(month.month, language)}
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
  const taka = useTaka();
  return <span className="tabular-nums">{taka(amount)}</span>;
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

/** What a litre fetched beside what it cost: either may be nothing, where no milk left or none went to Bulk. */
const LitreCell = ({ row }: MonthCell) => {
  const { t } = useLanguage();
  const perLitre = useTakaToThePaisa();
  const { fetchedPerLitreMoney, costPerLitreMoney } = row.original.dairy;
  if (fetchedPerLitreMoney === null && costPerLitreMoney === null) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("months.pair", {
        first:
          fetchedPerLitreMoney === null ? "—" : perLitre(fetchedPerLitreMoney),
        second: costPerLitreMoney === null ? "—" : perLitre(costPerLitreMoney),
      })}
    </span>
  );
};

const SoldCell = ({ row }: MonthCell) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const { sold, marginMoney } = row.original.fattening;
  if (marginMoney === null) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("months.pair", {
        first: formatNumber(sold, language),
        second: taka(marginMoney),
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
  const taka = useTaka();
  const perHead = usePerHeadPerDay();
  const { overheads } = row.original;
  if (!overheads) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {t("months.pair", {
        first: taka(overheads.amount),
        second: perHead(overheads.perHeadPerDayMoney),
      })}
    </span>
  );
};

const column = createListColumns<Month>();
const monthColumns = column.columns([
  column.accessor("month", {
    header: listHeader("months.col.month"),
    cell: MonthNameCell,
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
  column.accessor((row) => row.dairy.fetchedPerLitreMoney ?? undefined, {
    id: "litre",
    header: listHeader("months.col.litre"),
    cell: LitreCell,
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
]);

/** A month on a phone: its name and net on top, then its money, its milk and its fattening, each a line of words. */
const MonthCard = ({ month }: { month: Month }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const perLitre = useTakaToThePaisa();
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
          {taka(money.netMoney)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {t("owner.inAndOut", {
          in: taka(money.inMoney),
          out: taka(money.outMoney),
        })}
      </p>
      <p className="text-sm">
        {t("months.cardMilk", {
          sold: taka(dairy.milkSoldMoney),
          cost: taka(dairy.chargedMoney),
        })}
      </p>
      {dairy.fetchedPerLitreMoney !== null &&
      dairy.costPerLitreMoney !== null ? (
        <p className="text-muted-foreground text-sm">
          {t("months.cardLitre", {
            fetched: perLitre(dairy.fetchedPerLitreMoney),
            cost: perLitre(dairy.costPerLitreMoney),
          })}
        </p>
      ) : null}
      <p className="text-sm">
        {fattening.marginMoney === null
          ? t("months.cardNoneSold", { cost: taka(fattening.chargedMoney) })
          : t("months.cardSold", {
              count: fattening.sold,
              margin: taka(fattening.marginMoney),
              cost: taka(fattening.chargedMoney),
            })}
      </p>
      {month.overheads ? (
        <p className="text-muted-foreground text-sm">
          {t("months.cardOverheads", {
            amount: taka(month.overheads.amount),
            perHead: perHead(month.overheads.perHeadPerDayMoney),
          })}
        </p>
      ) : null}
    </div>
  );
};

const monthCard = (month: Month) => <MonthCard month={month} />;

/**
 * Each month, the newest first: the Farm's money in and out, the milk sold beside what the dairy cows cost and a litre
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
  const taka = useTaka();
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
            amount: taka(year.overheads.amount),
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
  const taka = useTaka();
  const range = (between: { lowMoney: number; highMoney: number }) =>
    t("projection.range", {
      low: taka(between.lowMoney),
      high: taka(between.highMoney),
    });
  const now = (() => {
    if (venture.settledProfitMoney !== null) {
      return t("months.made", { profit: taka(venture.settledProfitMoney) });
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
    <ul className="divide-border flex flex-col divide-y">
      {ventures.map((venture) => (
        <VentureLine key={venture.id} venture={venture} />
      ))}
    </ul>
  );
};
