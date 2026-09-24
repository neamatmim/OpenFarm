import type { LeftoverStanding } from "@OpenFarm/domain";
import { WASTING_LEFTOVER_PERCENT } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Utensils } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Loaded,
  SegmentedControl,
  StatusBadge,
} from "@/components/page";
import { FilterBar } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type LeftoverRow = Awaited<ReturnType<typeof orpc.feed.leftovers.call>>[number];

/** How far back the report reads, as the server offers it. */
const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

const STANDING_WORD = {
  wasting: "leftovers.standing.wasting",
  all_eaten: "leftovers.standing.all_eaten",
  fine: "leftovers.standing.fine",
  too_few: "leftovers.standing.too_few",
} as const satisfies Record<LeftoverStanding, MessageKey>;

const STANDING_TONE: Record<LeftoverStanding, Tone> = {
  wasting: "warning",
  all_eaten: "info",
  fine: "success",
  too_few: "neutral",
};

/** A quantity in its Feed Item's own unit. */
const Amount = ({ value, unit }: { value: number; unit: string }) => {
  const { language } = useLanguage();
  return (
    <span className="tabular-nums">
      {formatNumber(value, language)} {unit}
    </span>
  );
};

/** What to do about it, where there is something to do: give less where it is wasted, look where nothing is ever left. */
const whyOf = (
  row: LeftoverRow,
  t: ReturnType<typeof useLanguage>["t"]
): string | null => {
  if (row.standing === "all_eaten") {
    return t("leftovers.why.all_eaten");
  }
  if (row.standing !== "wasting") {
    return null;
  }
  return row.rationName
    ? t("leftovers.why.wasting", { ration: row.rationName })
    : t("leftovers.why.wastingNoRation");
};

/** Where it stands, and what to do about it. */
const Standing = ({ row }: { row: LeftoverRow }) => {
  const { t } = useLanguage();
  const why = whyOf(row, t);
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge tone={STANDING_TONE[row.standing]}>
        {t(STANDING_WORD[row.standing])}
      </StatusBadge>
      {why ? (
        <span className="text-muted-foreground text-xs">{why}</span>
      ) : null}
    </div>
  );
};

/** What was left behind, its share of what was given, and how often any was. */
const LeftBehind = ({ row }: { row: LeftoverRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        <Amount unit={row.unit} value={row.leftoverKg} />
        <span className="text-muted-foreground">
          {" · "}
          {t("leftovers.share", {
            percent: formatNumber(row.leftoverPercent, language),
          })}
        </span>
      </span>
      <span className="text-muted-foreground text-xs">
        {t("leftovers.sessions", {
          left: formatNumber(row.sessionsWithLeftover, language),
          sessions: formatNumber(row.sessions, language),
        })}
      </span>
    </div>
  );
};

/** What the feed left behind cost; feed never priced says so rather than costing nothing. */
const Worth = ({ row }: { row: LeftoverRow }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return row.worthBdt === null ? (
    <span className="text-muted-foreground text-xs">
      {t("leftovers.unpriced")}
    </span>
  ) : (
    <span className="tabular-nums">{taka(row.worthBdt)}</span>
  );
};

const PenCell = ({ row }: { row: { original: LeftoverRow } }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-medium">{row.original.penName}</span>
    {row.original.rationName ? (
      <span className="text-muted-foreground text-xs">
        {row.original.rationName}
      </span>
    ) : null}
  </div>
);

const GivenCell = ({ row }: { row: { original: LeftoverRow } }) => (
  <Amount unit={row.original.unit} value={row.original.givenKg} />
);

const LeftCell = ({ row }: { row: { original: LeftoverRow } }) => (
  <LeftBehind row={row.original} />
);

const WorthCell = ({ row }: { row: { original: LeftoverRow } }) => (
  <Worth row={row.original} />
);

const StandingCell = ({ row }: { row: { original: LeftoverRow } }) => (
  <Standing row={row.original} />
);

const column = createListColumns<LeftoverRow>();
const leftoverColumns = column.columns([
  column.accessor("penName", {
    header: listHeader("leftovers.col.pen"),
    cell: PenCell,
  }),
  column.accessor("itemName", { header: listHeader("leftovers.col.feed") }),
  column.accessor("givenKg", {
    header: listHeader("leftovers.col.given"),
    cell: GivenCell,
  }),
  column.accessor("leftoverPercent", {
    header: listHeader("leftovers.col.left"),
    cell: LeftCell,
  }),
  column.accessor((row) => row.worthBdt ?? undefined, {
    id: "worth",
    header: listHeader("leftovers.col.worth"),
    cell: WorthCell,
    meta: { align: "end" },
  }),
  column.accessor("standing", {
    header: listHeader("leftovers.col.standing"),
    cell: StandingCell,
    // Kept in the server's order — wasted first — rather than the alphabet's.
    enableSorting: false,
  }),
]);

/** One Pen's Leftovers of one feed on a phone: which, where it stands, and what was left and what it cost. */
const LeftoverCard = ({ row }: { row: LeftoverRow }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{row.itemName}</span>
        <span className="text-muted-foreground text-xs">{row.penName}</span>
      </span>
      <Worth row={row} />
    </div>
    <LeftBehind row={row} />
    <Standing row={row} />
  </div>
);

const leftoverCard = (row: LeftoverRow) => <LeftoverCard row={row} />;

/** The sentence over the list: what all of it cost, over the days read. */
const Summary = ({ rows, days }: { rows: LeftoverRow[]; days: Period }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const worth = rows.reduce((sum, one) => sum + (one.worthBdt ?? 0), 0);
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">
        {t("leftovers.summary", {
          days: formatNumber(days, language),
          worth: taka(worth),
        })}
      </p>
      <p className="text-muted-foreground text-sm">
        {t("leftovers.hint", {
          percent: formatNumber(WASTING_LEFTOVER_PERCENT, language),
        })}
      </p>
    </div>
  );
};

/**
 * What each Pen left in the trough of each feed over the last days, and what it cost — the Pens given more than they
 * eat first. The Owner's and the Manager's, as the farm's money is.
 */
export const LeftoversTab = () => {
  const { t, language } = useLanguage();
  const [days, setDays] = useState<Period>(7);
  const leftovers = useQuery(
    orpc.feed.leftovers.queryOptions({ input: { days } })
  );
  const rows = leftovers.data ?? [];
  const table = useListTable({
    columns: leftoverColumns,
    data: rows,
    getRowId: (row) => `${row.penId}:${row.feedItemId}`,
  });
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar className="border-b pb-4 sm:justify-between">
        <SegmentedControl
          label={t("leftovers.period")}
          name="leftover-days"
          onChange={(value) => setDays(Number(value) as Period)}
          options={PERIODS.map((one) => ({
            value: String(one),
            label: t("leftovers.days", { days: formatNumber(one, language) }),
          }))}
          value={String(days)}
        />
      </FilterBar>
      <Loaded
        query={leftovers}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {rows.length === 0 ? (
          <EmptyState bare icon={Utensils} title={t("leftovers.none")} />
        ) : (
          <>
            <Summary days={days} rows={rows} />
            <DataTable card={leftoverCard} minWidth="60rem" table={table} />
          </>
        )}
      </Loaded>
    </div>
  );
};
