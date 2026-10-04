import type { Keeping } from "@OpenFarm/domain";
import { KEEPING } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
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
import {
  PriceCell,
  PriceLine,
  useIsOwner,
  useKeepings,
} from "@/components/fattening/animal-prices";
import { GainFigures, WeightAgainstTarget } from "@/components/gain";
import { Nothing } from "@/components/list-cells";
import { EmptyState, ProgressBar } from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";

import type { BoardRow, Standing } from "./fattening-types";
import { ORDER, standingOf } from "./fattening-types";
import { StandingBadges, StateBadge, TagLink } from "./fattening-words";
import { OnRationVerdict } from "./on-ration";

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
    <Button
      nativeButton={false}
      render={<Link search={{ sell: row.tagNumber }} to="/sales" />}
      size="sm"
      variant="outline"
    >
      <Store aria-hidden data-icon="inline-start" />
      {t("sale.record")}
    </Button>
  );
};

interface BoardCell {
  row: { original: BoardRow };
}

const TagCell = ({ row }: BoardCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

// Held to a width, so an animal with two badges stacks them rather than widening the whole column for one row.
const StandingCell = ({ row }: BoardCell) => (
  <div className="max-w-44">
    <StandingBadges row={row.original} />
  </div>
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
    return <Nothing />;
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

/**
 * Her gain as one cell, where three columns had come to say nearly the same: the rate the board judges her on — lately,
 * or since she came while no reading is far enough back — with where it lands her; the other rate under it, which says
 * which the first was; then what she is judged against on her Ration, and what her penmates put on.
 */
const GainCell = ({ row }: BoardCell) => {
  const { t, language } = useLanguage();
  const { recent, sinceIntake } = row.original;
  const other = recent ? sinceIntake : null;
  // Missing from an answer this phone kept from before the board said how a Pen gains.
  const penmates = row.original.onRation?.penmates;
  return (
    <div className="flex flex-col items-end gap-0.5">
      {/* Said only when no reading is recent enough: otherwise the line beneath, since she came, says which this is. */}
      {!recent && sinceIntake ? (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("gain.sinceIntake")}
        </span>
      ) : null}
      <GainFigures basis={recent ?? sinceIntake} />
      {other ? (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {`${t("gain.sinceIntake")} ${t("gain.perDay", {
            kg: formatNumber(other.dailyGainKg, language),
          })}`}
        </span>
      ) : null}
      <span className="max-w-60 text-end">
        <OnRationVerdict row={row.original} />
      </span>
      {penmates ? (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("gainOnRation.penmatesShort", {
            gain: t("gain.perDay", {
              kg: formatNumber(penmates.middleKg, language),
            }),
          })}
        </span>
      ) : null}
    </div>
  );
};

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
  column.accessor((row) => (row.recent ?? row.sinceIntake)?.dailyGainKg, {
    id: "gain",
    header: listHeader("gain.col.gain"),
    cell: GainCell,
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

const PriceOfCell = ({ row }: { row: { original: BoardRow } }) => (
  <PriceCell tagNumber={row.original.tagNumber} />
);

/** The same, with each animal's price against her cost before the last column: the Owner's list. */
const boardColumnsPriced = column.columns([
  ...boardColumns.slice(0, -1),
  column.display({
    id: "price",
    header: listHeader("price.col"),
    cell: PriceOfCell,
    meta: { align: "end" },
  }),
  ...boardColumns.slice(-1),
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

/** The rate she is judged on, named, with what her Ration makes of it after — one line where the card said three. */
const JudgedRateLine = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  const judged = row.recent ?? row.sinceIntake;
  return (
    <span className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
      <span>
        {judged
          ? `${t(row.recent ? "gain.recent" : "gain.sinceIntake")} ${t(
              "gain.perDay",
              { kg: formatNumber(judged.dailyGainKg, language) }
            )}`
          : t("gain.needsTwo")}
      </span>
      <OnRationVerdict row={row} />
    </span>
  );
};

/** An animal on a phone: her tag and where she stands on top, her weight large, the pen and her days, the rate she is
 *  judged on with what her Ration makes of it, what she might fetch and whether to keep her — her cost is on her page —
 *  and the menu at the side. */
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
        <JudgedRateLine row={row} />
        <PriceLine compact tagNumber={row.tagNumber} />
      </div>
      <SellHer row={row} />
    </div>
  );
};

const boardCard = (row: BoardRow) => <BoardCard row={row} />;

export type StandingFilter = "all" | Standing;

export const STANDING_FILTERS: readonly StandingFilter[] = [
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

/** Whether keeping them pays, as the Owner filters the board by it. */
export type KeepingFilter = "all" | Keeping;

export const KEEPING_FILTERS: readonly KeepingFilter[] = ["all", ...KEEPING];

const KEEPING_WORD = {
  all: "keep.all",
  pays: "keep.pays",
  close: "keep.close",
  costs_more: "keep.costsMore",
} as const;

/** The Owner's filter by whether keeping an animal another fortnight pays, with how many are in each answer. */
const KeepingSelect = ({
  rows,
  keepings,
  value,
  onChange,
}: {
  rows: BoardRow[];
  keepings: Map<string, Keeping | "unknown">;
  value: KeepingFilter;
  onChange: (value: KeepingFilter) => void;
}) => {
  const { t, language } = useLanguage();
  const count = (keeping: KeepingFilter) =>
    keeping === "all"
      ? rows.length
      : rows.filter((row) => keepings.get(row.tagNumber) === keeping).length;
  return (
    <NativeSelect
      aria-label={t("keep.title")}
      className="sm:w-56"
      onChange={(event) =>
        onChange(
          KEEPING_FILTERS.find((one) => one === event.target.value) ?? "all"
        )
      }
      value={value}
    >
      {KEEPING_FILTERS.map((keeping) => (
        <option key={keeping} value={keeping}>
          {`${t(KEEPING_WORD[keeping])} · ${formatNumber(count(keeping), language)}`}
        </option>
      ))}
    </NativeSelect>
  );
};

/** Where the board is on its page, for the figures above that show it filtered to scroll to. */
export const FATTENING_BOARD_ID = "fattening-board";

/**
 * The fattening side as one list: short of the target first, filtered by where an animal stands, by Pen, or found by
 * her tag, a page at a time — and, for the Owner, by whether keeping her pays, which the page keeps in its address so
 * the farm's home can send the Owner straight to the ones that cost more to keep. A table where there is room, so a
 * slow one stands out down a column; a card each on a phone.
 */
export const FatteningBoard = ({
  rows,
  standing,
  onStanding,
  keeping,
  onKeeping,
}: {
  rows: BoardRow[];
  /** Kept in the page's address, as keeping is, so the figures above can set it. */
  standing: StandingFilter;
  onStanding: (value: StandingFilter) => void;
  keeping: KeepingFilter;
  onKeeping: (value: KeepingFilter) => void;
}) => {
  const { t } = useLanguage();
  const [penId, setPenId] = useState("");
  const [search, setSearch] = useState("");
  const keepings = useKeepings();
  const wanted = search.trim().toUpperCase();
  // Only once the Owner's prices are read: a filter nobody else can see, or not yet, filters nothing.
  const keepingShown = keepings === null ? "all" : keeping;
  const shown = rows.filter(
    (row) =>
      (standing === "all" || standingOf(row.onTrack) === standing) &&
      (penId === "" || row.penId === penId) &&
      (wanted === "" || row.tagNumber.toUpperCase().includes(wanted)) &&
      (keepingShown === "all" || keepings?.get(row.tagNumber) === keepingShown)
  );
  const owner = useIsOwner();
  const table = useListTable({
    columns: owner ? boardColumnsPriced : boardColumns,
    data: shown,
    getRowId: (row) => row.id,
  });
  return (
    <div
      className="surface flex scroll-mt-20 flex-col gap-4 p-4 md:p-5"
      id={FATTENING_BOARD_ID}
    >
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
          <StandingSelect onChange={onStanding} rows={rows} value={standing} />
          <PenSelect onChange={setPenId} rows={rows} value={penId} />
          {keepings === null ? null : (
            <KeepingSelect
              keepings={keepings}
              onChange={onKeeping}
              rows={rows}
              value={keepingShown}
            />
          )}
        </div>
      </FilterBar>
      {shown.length === 0 ? (
        <EmptyState bare icon={Beef} title={t("gain.noneInFilter")} />
      ) : (
        <DataTable
          card={boardCard}
          key={`${standing}:${penId}:${wanted}:${keepingShown}`}
          minWidth="60rem"
          pageSize={BOARD_PAGE}
          table={table}
        />
      )}
    </div>
  );
};
