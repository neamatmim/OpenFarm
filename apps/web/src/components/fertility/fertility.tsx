import type { HerdFertility } from "@OpenFarm/domain";
import { DRY_OFF_TARGETS, FERTILITY_TARGETS } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import {
  CalendarClock,
  CalendarRange,
  Milk,
  Repeat,
  Sun,
  Timer,
  Users,
} from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagLink } from "@/components/fattening/fattening-words";
import { Nothing } from "@/components/list-cells";
import { Section, StatusBadge } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { client } from "@/utils/orpc";

/**
 * How quickly the farm's cows get back in calf (domain `fertility.ts`): the year's five measures against what DLS asks
 * of a profitable dairy, the same month by month, and each cow since she last calved, the longest open first.
 */

export type Fertility = Awaited<ReturnType<typeof client.breeding.fertility>>;
type SinceCalving = Fertility["cows"][number];
type Month = Fertility["months"][number];

/** A cow open this long after calving has passed DLS's 85 days open: the cows to go and see. */
const OPEN_TOO_LONG_DAYS = FERTILITY_TARGETS.daysOpen.high;

/** Over the top of its target: said in the warning color. */
const overTarget = (value: number | null, target: { high: number }): boolean =>
  value !== null && value > target.high;

/** The year's five measures, each with what DLS asks and how many events it was read from. */
export const FertilityFigures = ({ year }: { year: HerdFertility }) => {
  const { t, language } = useLanguage();
  const days = (value: number | null) =>
    value === null
      ? "—"
      : t("fertility.days", { days: formatNumber(value, language) });
  const target = (range: { low: number; high: number }, count: number) =>
    t("fertility.target", {
      low: formatNumber(range.low, language),
      high: formatNumber(range.high, language),
      count: formatNumber(count, language),
    });
  return (
    <SummaryFigures
      figures={[
        {
          label: t("fertility.calvingInterval"),
          value: days(year.calvingIntervalDays),
          hint: target(
            FERTILITY_TARGETS.calvingIntervalDays,
            year.calvingIntervals
          ),
          icon: CalendarRange,
          tone: overTarget(
            year.calvingIntervalDays,
            FERTILITY_TARGETS.calvingIntervalDays
          )
            ? "warning"
            : "neutral",
        },
        {
          label: t("fertility.daysOpen"),
          value: days(year.daysOpen),
          hint: target(FERTILITY_TARGETS.daysOpen, year.conceptions),
          icon: CalendarClock,
          tone: overTarget(year.daysOpen, FERTILITY_TARGETS.daysOpen)
            ? "warning"
            : "neutral",
        },
        {
          label: t("fertility.toFirstService"),
          value: days(year.daysToFirstService),
          hint: target(
            FERTILITY_TARGETS.daysToFirstService,
            year.firstServices
          ),
          icon: Timer,
          tone: overTarget(
            year.daysToFirstService,
            FERTILITY_TARGETS.daysToFirstService
          )
            ? "warning"
            : "neutral",
        },
        {
          label: t("fertility.conceptionRate"),
          value:
            year.conceptionRate === null
              ? "—"
              : `${formatNumber(Math.round(year.conceptionRate * 100), language)}%`,
          hint: t("fertility.ofAttempts", {
            count: formatNumber(year.attemptsKnown, language),
          }),
          icon: Repeat,
          tone: "neutral",
        },
        {
          label: t("fertility.ageAtFirstCalving"),
          value:
            year.ageAtFirstCalvingMonths === null
              ? "—"
              : t("fertility.months", {
                  months: formatNumber(year.ageAtFirstCalvingMonths, language),
                }),
          hint: t("fertility.fromFirstCalvings", {
            count: formatNumber(year.firstCalvings, language),
          }),
          icon: Users,
          tone: "neutral",
        },
      ]}
    />
  );
};

/** Outside its aim, either way: said in the warning color. */
const outsideAim = (
  value: number | null,
  aim: { low: number; high: number }
): boolean => value !== null && (value < aim.low || value > aim.high);

/**
 * The year's Dry Periods and the Lactations they ended (domain `dry-offs.ts`), against what a dairy aims at, and each
 * Dry Period outside it with its cow. Nothing from an answer kept from before Dry-offs were kept.
 */
export const DryOffFigures = ({
  dryOffs,
}: {
  dryOffs: Fertility["dryOffs"] | undefined;
}) => {
  const { t, language } = useLanguage();
  if (dryOffs === undefined) {
    return null;
  }
  const days = (value: number | null) =>
    value === null
      ? "—"
      : t("fertility.days", { days: formatNumber(value, language) });
  const aim = (range: { low: number; high: number }, count: number) =>
    t("dryOff.target", {
      low: formatNumber(range.low, language),
      high: formatNumber(range.high, language),
      count: formatNumber(count, language),
    });
  const { dryPeriodDays, lactationDays } = DRY_OFF_TARGETS;
  return (
    <Section description={t("dryOff.hint")} title={t("dryOff.title")}>
      <SummaryFigures
        figures={[
          {
            label: t("dryOff.dryPeriod"),
            value: days(dryOffs.dryPeriodDays),
            hint: aim(dryPeriodDays, dryOffs.dryPeriods),
            icon: Sun,
            tone: outsideAim(dryOffs.dryPeriodDays, dryPeriodDays)
              ? "warning"
              : "neutral",
          },
          {
            label: t("dryOff.lactationLength"),
            value: days(dryOffs.lactationDays),
            hint: aim(lactationDays, dryOffs.lactations),
            icon: Milk,
            tone: outsideAim(dryOffs.lactationDays, lactationDays)
              ? "warning"
              : "neutral",
          },
        ]}
      />
      {dryOffs.outsideTarget.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">
            {t("dryOff.outside", {
              low: formatNumber(dryPeriodDays.low, language),
              high: formatNumber(dryPeriodDays.high, language),
            })}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {dryOffs.outsideTarget.map((one) => (
              <li
                className="flex flex-wrap items-center gap-2"
                key={`${one.tagNumber}-${one.lactationNumber}`}
              >
                <TagLink tagNumber={one.tagNumber} />
                <span className="text-muted-foreground">
                  {t("dryOff.outsideLine", {
                    days: formatNumber(one.dryDays, language),
                    number: formatNumber(one.lactationNumber, language),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
};

interface MonthCell {
  row: { original: Month };
}

const MonthName = ({ row }: MonthCell) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatDate(
        new Date(`${row.original.month}-15T00:00:00Z`),
        language,
        "monthYear"
      )}
    </span>
  );
};

const RateCell = ({ row }: MonthCell) => {
  const { language } = useLanguage();
  const { conceptionRate, attemptsKnown } = row.original;
  if (conceptionRate === null) {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {`${formatNumber(Math.round(conceptionRate * 100), language)}% · ${formatNumber(attemptsKnown, language)}`}
    </span>
  );
};

/** A mean of days, or nothing where the month had none. */
const DaysFigure = ({ value }: { value: number | null }) => {
  const { language } = useLanguage();
  return value === null ? (
    <Nothing />
  ) : (
    <span className="tabular-nums">{formatNumber(value, language)}</span>
  );
};

const OpenDaysCell = ({ row }: MonthCell) => (
  <DaysFigure value={row.original.daysOpen} />
);
const FirstServiceCell = ({ row }: MonthCell) => (
  <DaysFigure value={row.original.daysToFirstService} />
);
const IntervalCell = ({ row }: MonthCell) => (
  <DaysFigure value={row.original.calvingIntervalDays} />
);

const monthColumn = createListColumns<Month>();
const monthColumns = monthColumn.columns([
  monthColumn.accessor("month", {
    header: listHeader("fertility.col.month"),
    cell: MonthName,
  }),
  monthColumn.accessor((row) => row.conceptionRate ?? undefined, {
    id: "rate",
    header: listHeader("fertility.conceptionRate"),
    cell: RateCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  monthColumn.accessor((row) => row.daysOpen ?? undefined, {
    id: "open",
    header: listHeader("fertility.daysOpen"),
    cell: OpenDaysCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  monthColumn.accessor((row) => row.daysToFirstService ?? undefined, {
    id: "first",
    header: listHeader("fertility.toFirstService"),
    cell: FirstServiceCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  monthColumn.accessor((row) => row.calvingIntervalDays ?? undefined, {
    id: "interval",
    header: listHeader("fertility.calvingInterval"),
    cell: IntervalCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
]);

/** One month on a phone: its name, then each measure it had. */
const MonthCard = ({ month }: { month: Month }) => {
  const { t, language } = useLanguage();
  const lines = [
    month.conceptionRate === null
      ? null
      : `${t("fertility.conceptionRate")}: ${formatNumber(Math.round(month.conceptionRate * 100), language)}%`,
    month.daysOpen === null
      ? null
      : `${t("fertility.daysOpen")}: ${formatNumber(month.daysOpen, language)}`,
    month.calvingIntervalDays === null
      ? null
      : `${t("fertility.calvingInterval")}: ${formatNumber(month.calvingIntervalDays, language)}`,
  ].filter((line): line is string => line !== null);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">
        {formatDate(
          new Date(`${month.month}-15T00:00:00Z`),
          language,
          "monthYear"
        )}
      </span>
      {lines.length === 0 ? (
        <Nothing />
      ) : (
        lines.map((line) => (
          <span className="text-muted-foreground text-sm" key={line}>
            {line}
          </span>
        ))
      )}
    </div>
  );
};

const monthCard = (month: Month) => <MonthCard month={month} />;

/** The year a month at a time, newest first: whether the farm is getting cows in calf sooner or later. */
export const FertilityByMonth = ({ months }: { months: Month[] }) => {
  const { t } = useLanguage();
  const table = useListTable({
    columns: monthColumns,
    data: months.toReversed(),
    getRowId: (row) => row.month,
  });
  return (
    <Section title={t("fertility.byMonth")}>
      <DataTable card={monthCard} minWidth="44rem" table={table} />
    </Section>
  );
};

interface CowCell {
  row: { original: SinceCalving };
}

const CowTag = ({ row }: CowCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const CalvedCell = ({ row }: CowCell) => {
  const { t, language } = useLanguage();
  return (
    <span className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap">
        {formatDate(new Date(row.original.calvedAt), language, "date")}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {t("cull.sinceCalving", {
          days: formatNumber(row.original.daysSinceCalving, language),
        })}
      </span>
    </span>
  );
};

/** Settled, and how many days she was open; or open still, in the warning color once past DLS's days. */
const SettledCell = ({ row }: CowCell) => {
  const { t, language } = useLanguage();
  const { daysOpen, daysSinceCalving } = row.original;
  if (daysOpen !== null) {
    return (
      <span className="tabular-nums">
        {t("fertility.days", { days: formatNumber(daysOpen, language) })}
      </span>
    );
  }
  return (
    <StatusBadge
      tone={daysSinceCalving > OPEN_TOO_LONG_DAYS ? "warning" : "neutral"}
    >
      {t("cull.notInCalf")}
    </StatusBadge>
  );
};

const AttemptsCell = ({ row }: CowCell) => {
  const { language } = useLanguage();
  return (
    <span className="tabular-nums">
      {formatNumber(row.original.attempts, language)}
    </span>
  );
};

const LastIntervalCell = ({ row }: CowCell) => {
  const { t, language } = useLanguage();
  const days = row.original.lastCalvingIntervalDays;
  return days === null ? (
    <Nothing />
  ) : (
    <span className="tabular-nums">
      {t("fertility.days", { days: formatNumber(days, language) })}
    </span>
  );
};

const cowColumn = createListColumns<SinceCalving>();
const cowColumns = cowColumn.columns([
  cowColumn.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: CowTag,
  }),
  cowColumn.accessor("daysSinceCalving", {
    header: listHeader("fertility.col.calved"),
    cell: CalvedCell,
  }),
  cowColumn.accessor("attempts", {
    header: listHeader("fertility.col.attempts"),
    cell: AttemptsCell,
    meta: { align: "end" },
  }),
  cowColumn.accessor((row) => row.daysOpen ?? undefined, {
    id: "open",
    header: listHeader("fertility.daysOpen"),
    cell: SettledCell,
    sortUndefined: "first",
  }),
  cowColumn.accessor((row) => row.lastCalvingIntervalDays ?? undefined, {
    id: "interval",
    header: listHeader("fertility.col.lastInterval"),
    cell: LastIntervalCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
]);

/** A cow on a phone: her tag and whether she has settled, then when she calved and her Attempts since. */
const CowCard = ({ cow }: { cow: SinceCalving }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <TagLink tagNumber={cow.tagNumber} />
        <SettledCell row={{ original: cow }} />
      </div>
      <span className="text-muted-foreground text-sm">
        {t("cull.sinceCalving", {
          days: formatNumber(cow.daysSinceCalving, language),
        })}
        {" · "}
        {t("fertility.attemptsCount", {
          count: formatNumber(cow.attempts, language),
        })}
      </span>
    </div>
  );
};

const cowCard = (cow: SinceCalving) => <CowCard cow={cow} />;

/** Every cow in milk or dry since her latest calving, the longest open first: the cows to go and see. */
export const CowsSinceCalving = ({ cows }: { cows: SinceCalving[] }) => {
  const { t } = useLanguage();
  const table = useListTable({
    columns: cowColumns,
    data: cows,
    getRowId: (row) => row.cowId,
  });
  return (
    <Section description={t("fertility.cowsHint")} title={t("fertility.cows")}>
      <DataTable card={cowCard} minWidth="44rem" pageSize={20} table={table} />
    </Section>
  );
};
