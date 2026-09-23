import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { BoardRow } from "@/components/fattening/fattening-types";
import { StateBadge, TagLink } from "@/components/fattening/fattening-words";
import { Nothing } from "@/components/list-cells";
import { EmptyState, Loaded, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** How many of the newest arrivals are shown: enough to see today's lorry, and yesterday's. */
const RECENT_SHOWN = 8;

interface RecentCell {
  row: { original: BoardRow };
}

const TagCell = ({ row }: RecentCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const StateCell = ({ row }: RecentCell) => (
  <StateBadge state={row.original.state} />
);

/** How long ago she came off the lorry, in days. */
const DaysCell = ({ row }: RecentCell) => {
  const { t, language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {t("correct.spanDays", {
        days: formatNumber(row.original.daysOnFeed ?? 0, language),
      })}
    </span>
  );
};

const WeightCell = ({ row }: RecentCell) => {
  const { t, language } = useLanguage();
  const kg = row.original.latestKg;
  return kg === null ? (
    <Nothing />
  ) : (
    <span className="whitespace-nowrap">
      {t("intake.kg", { kg: formatNumber(kg, language) })}
    </span>
  );
};

const column = createListColumns<BoardRow>();
const recentColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    meta: { className: "whitespace-nowrap" },
  }),
  column.accessor("state", {
    header: listHeader("animals.state"),
    cell: StateCell,
  }),
  column.accessor((row) => row.daysOnFeed ?? undefined, {
    id: "daysOnFeed",
    header: listHeader("gain.daysOnFeed"),
    cell: DaysCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.latestKg ?? undefined, {
    id: "latestKg",
    header: listHeader("gain.now"),
    cell: WeightCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
]);

/** A new arrival on a phone: her tag and State, the pen, and how long she has been here. */
const RecentCard = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <TagLink tagNumber={row.tagNumber} />
          <StateBadge state={row.state} />
        </div>
        <span className="text-muted-foreground text-xs">
          {[
            row.penName,
            `${t("gain.daysOnFeed")} ${t("correct.spanDays", {
              days: formatNumber(row.daysOnFeed ?? 0, language),
            })}`,
          ].join(" · ")}
        </span>
      </div>
      <span className="font-semibold tabular-nums">
        <WeightCell row={{ original: row }} />
      </span>
    </div>
  );
};

const recentCard = (row: BoardRow) => <RecentCard row={row} />;

/** The newest arrivals still on the fattening side, newest first. */
const RecentTable = ({ rows }: { rows: BoardRow[] }) => {
  const table = useListTable({
    columns: recentColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return <DataTable card={recentCard} minWidth="40rem" table={table} />;
};

/**
 * The animals taken in most recently, below the form: so the Manager at the lorry can see the last one went in, and
 * that the one in front of them has not already been written up by somebody else.
 */
export const RecentIntakes = () => {
  const { t } = useLanguage();
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));
  const recent = (board.data ?? [])
    .filter((row) => row.daysOnFeed !== null)
    .toSorted(
      (a, b) =>
        (a.daysOnFeed ?? 0) - (b.daysOnFeed ?? 0) ||
        b.tagNumber.localeCompare(a.tagNumber)
    )
    .slice(0, RECENT_SHOWN);
  return (
    <Section
      description={t("intake.recentHint")}
      id="intake-recent"
      title={t("intake.recent")}
    >
      <Loaded query={board} skeleton={<Skeleton className="h-32 rounded-lg" />}>
        {recent.length === 0 ? (
          <EmptyState bare icon={Truck} title={t("intake.recentEmpty")} />
        ) : (
          <RecentTable rows={recent} />
        )}
      </Loaded>
    </Section>
  );
};
