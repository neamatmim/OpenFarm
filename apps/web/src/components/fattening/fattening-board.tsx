import { formatNumber } from "@OpenFarm/i18n";
import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Link } from "@tanstack/react-router";
import { Beef, Store } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { GainFigures, WeightAgainstTarget } from "@/components/gain";
import { EmptyState, ProgressBar } from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";

import type { BoardRow, Standing } from "./fattening-types";
import { ORDER, standingOf } from "./fattening-types";
import {
  RatesLine,
  StandingBadges,
  StateBadge,
  TagLink,
} from "./fattening-words";

/** How many animals the board shows before the next page. */
const BOARD_PAGE = 20;

/**
 * The one thing done from a row of the board: selling her, once she is Ready for Sale.
 *
 * Nothing else earns a place here. Her own page is her Tag Number, already a link; the suggestions for sale are
 * a page of their own in the sidebar, not something about her. A menu that held those was a click to find a
 * link that was on the screen already.
 */
const SellHer = ({ row }: { row: BoardRow }) => {
  const { t } = useLanguage();
  if (row.state !== "ready_for_sale") {
    return null;
  }
  return (
    <Link
      className={buttonVariants({ size: "sm", variant: "outline" })}
      search={{ sell: row.tagNumber }}
      to="/sale"
    >
      <Store aria-hidden data-icon="inline-start" />
      {t("sale.record")}
    </Link>
  );
};

interface BoardCell {
  row: { original: BoardRow };
}

const TagCell = ({ row }: BoardCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const StandingCell = ({ row }: BoardCell) => (
  <StandingBadges row={row.original} />
);

/** The Pen she stands in, and her State beneath it: one column, so her figures still fit beside her two rates. */
const PenCell = ({ row }: BoardCell) => (
  <div className="flex flex-col items-start gap-1">
    <span className="whitespace-nowrap">{row.original.penName}</span>
    <StateBadge state={row.original.state} />
  </div>
);

const DaysCell = ({ row }: BoardCell) => {
  const { t, language } = useLanguage();
  const days = row.original.daysOnFeed;
  if (days === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {t("correct.spanDays", { days: formatNumber(days, language) })}
    </span>
  );
};

const WeightCell = ({ row }: BoardCell) => (
  <WeightAgainstTarget
    bar
    latestKg={row.original.latestKg}
    targetWeightKg={row.original.targetWeightKg}
  />
);

const SinceIntakeCell = ({ row }: BoardCell) => (
  <GainFigures basis={row.original.sinceIntake} />
);

const RecentCell = ({ row }: BoardCell) => (
  <GainFigures basis={row.original.recent} />
);

const SellCell = ({ row }: BoardCell) => (
  <div className="flex justify-end">
    <SellHer row={row.original} />
  </div>
);

const column = createListColumns<BoardRow>();
const boardColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor((row) => ORDER[standingOf(row.onTrack)], {
    id: "standing",
    header: listHeader("gain.col.standing"),
    cell: StandingCell,
  }),
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    cell: PenCell,
  }),
  column.accessor((row) => row.daysOnFeed ?? undefined, {
    id: "daysOnFeed",
    header: listHeader("gain.daysOnFeed"),
    cell: DaysCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.latestKg ?? undefined, {
    id: "latestKg",
    header: listHeader("gain.now"),
    cell: WeightCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.sinceIntake?.dailyGainKg, {
    id: "sinceIntake",
    header: listHeader("gain.sinceIntake"),
    cell: SinceIntakeCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.recent?.dailyGainKg, {
    id: "recent",
    header: listHeader("gain.recent"),
    cell: RecentCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.display({
    id: "sell",
    header: ActionsHeader,
    cell: SellCell,
    meta: { align: "end" },
  }),
]);

/** What she weighs now against her target, large, with how far she has come beneath — or why there is no bar. */
const WeightNow = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  return (
    <div className="flex flex-col gap-1.5">
      <p className="tabular-nums">
        <span className="text-lg font-semibold">
          {row.latestKg === null ? t("gain.noneYet") : kg(row.latestKg)}
        </span>
        {row.targetWeightKg === null || row.latestKg === null ? null : (
          <span className="text-muted-foreground text-sm">
            {" / "}
            {kg(row.targetWeightKg)}
          </span>
        )}
      </p>
      {row.latestKg === null || row.targetWeightKg === null ? null : (
        <ProgressBar
          className="h-1.5"
          label={`${t("gain.now")} / ${t("intake.targetWeight")}`}
          value={(row.latestKg / row.targetWeightKg) * 100}
        />
      )}
    </div>
  );
};

/** An animal on a phone: her tag and where she stands on top, her weight large, the pen, her days and both rates
 *  beneath, and the menu at the side. */
const BoardCard = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  const details = [row.penName, t(`state.${row.state}`)];
  if (row.daysOnFeed !== null) {
    details.push(
      `${t("gain.daysOnFeed")} ${t("correct.spanDays", {
        days: formatNumber(row.daysOnFeed, language),
      })}`
    );
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TagLink tagNumber={row.tagNumber} />
          <StandingBadges row={row} />
        </div>
        <WeightNow row={row} />
        <span className="text-muted-foreground text-xs">
          {details.join(" · ")}
        </span>
        <RatesLine recent={row.recent} sinceIntake={row.sinceIntake} />
      </div>
      <SellHer row={row} />
    </div>
  );
};

const boardCard = (row: BoardRow) => <BoardCard row={row} />;

type StandingFilter = "all" | Standing;

const STANDING_FILTERS: readonly StandingFilter[] = [
  "all",
  "behind",
  "unknown",
  "onTrack",
];

const FILTER_WORD = {
  all: "gain.all",
  behind: "gain.behind",
  unknown: "gain.noRate",
  onTrack: "gain.onTrack",
} as const;

/** The Pens the board's animals stand in, once each, by name. */
const pensOf = (rows: BoardRow[]) =>
  [...new Map(rows.map((row) => [row.penId, row.penName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

/** The standing filter, with how many animals are in each group beside its name. */
const StandingSelect = ({
  rows,
  value,
  onChange,
}: {
  rows: BoardRow[];
  value: StandingFilter;
  onChange: (value: StandingFilter) => void;
}) => {
  const { t, language } = useLanguage();
  const count = (standing: StandingFilter) =>
    standing === "all"
      ? rows.length
      : rows.filter((row) => standingOf(row.onTrack) === standing).length;
  return (
    <NativeSelect
      aria-label={t("gain.col.standing")}
      className="sm:w-56"
      onChange={(event) =>
        onChange(
          STANDING_FILTERS.find((one) => one === event.target.value) ?? "all"
        )
      }
      value={value}
    >
      {STANDING_FILTERS.map((standing) => (
        <option key={standing} value={standing}>
          {`${t(FILTER_WORD[standing])} · ${formatNumber(count(standing), language)}`}
        </option>
      ))}
    </NativeSelect>
  );
};

/** Every Pen on the board, for its filter. */
const PenSelect = ({
  rows,
  value,
  onChange,
}: {
  rows: BoardRow[];
  value: string;
  onChange: (value: string) => void;
}) => {
  const t = useT();
  return (
    <NativeSelect
      aria-label={t("gain.filterPen")}
      className="sm:w-48"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{t("gain.allPens")}</option>
      {pensOf(rows).map((pen) => (
        <option key={pen.id} value={pen.id}>
          {pen.name}
        </option>
      ))}
    </NativeSelect>
  );
};

/**
 * The fattening side as one list: short of the target first, filtered by where an animal stands, by Pen, or found by
 * her tag, a page at a time. A table where there is room, so a slow one stands out down a column; a card each on a
 * phone.
 */
export const FatteningBoard = ({ rows }: { rows: BoardRow[] }) => {
  const { t } = useLanguage();
  const [standing, setStanding] = useState<StandingFilter>("all");
  const [penId, setPenId] = useState("");
  const [search, setSearch] = useState("");
  const wanted = search.trim().toUpperCase();
  const shown = rows.filter(
    (row) =>
      (standing === "all" || standingOf(row.onTrack) === standing) &&
      (penId === "" || row.penId === penId) &&
      (wanted === "" || row.tagNumber.toUpperCase().includes(wanted))
  );
  const table = useListTable({
    columns: boardColumns,
    data: shown,
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar className="border-b pb-4">
        <Input
          aria-label={t("animals.search")}
          autoComplete="off"
          className="sm:w-56"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("animals.searchPlaceholder")}
          type="search"
          value={search}
        />
        {/* Side by side on a phone too, so the list starts a row sooner. */}
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <StandingSelect onChange={setStanding} rows={rows} value={standing} />
          <PenSelect onChange={setPenId} rows={rows} value={penId} />
        </div>
      </FilterBar>
      {shown.length === 0 ? (
        <EmptyState bare icon={Beef} title={t("gain.noneInFilter")} />
      ) : (
        <DataTable
          card={boardCard}
          key={`${standing}:${penId}:${wanted}`}
          minWidth="60rem"
          pageSize={BOARD_PAGE}
          table={table}
        />
      )}
    </div>
  );
};
