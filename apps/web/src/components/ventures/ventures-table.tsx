import { startOfFarmDay } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing, SaidDate } from "@/components/list-cells";
import { RowMenu } from "@/components/page-kit";
import type { VentureActs } from "@/components/ventures/venture-card";
import {
  CardBadges,
  PrimaryActs,
  StateBadge,
  VentureCard,
  WhatStopsHer,
  actsInTheMenu,
  moneyOf,
} from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";

/** One Venture as the table reads it: the Venture itself, what the page can do to it, and the month the
 *  bank is claimed straight up to. */
interface VentureRow {
  venture: Venture;
  acts: VentureActs;
  lastMonthOver: string;
}

interface Cell {
  row: { original: VentureRow };
}

/**
 * The name, and under it everything about where the run stands: its state, how the bank sits, and what is
 * wrong with it.
 *
 * All in the one column because they are one question — how is this Venture doing — and because a column
 * of its own for the bank took the width the acts at the end of the row needed for their words.
 */
const VentureCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const { venture, acts, lastMonthOver } = row.original;
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <button
        aria-label={t("ventures.details")}
        className="rounded-md text-start font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        onClick={() => acts.details(venture)}
        type="button"
      >
        {venture.name}
      </button>
      {/* Free to wrap inside, so a long badge is what the column bends around rather than what sets its width. */}
      <span className="flex flex-wrap items-center gap-1 [&_[data-slot=badge]]:text-start [&_[data-slot=badge]]:whitespace-normal">
        <StateBadge state={venture.state} />
        <CardBadges lastMonthOver={lastMonthOver} venture={venture} />
      </span>
      {/* What stands in the way of a dim button, said under the run it is about rather than squeezed under
          the buttons, where the column would have to be as wide as the sentence. */}
      <span className="[&_p]:max-w-none [&_p]:text-left">
        <WhatStopsHer dense venture={venture} />
      </span>
    </span>
  );
};

/** What the run is looking for: the capital its Units add up to. */
const TargetCell = ({ row }: Cell) => {
  const taka = useTaka();
  return (
    <span className="tabular-nums">
      {taka(row.original.venture.targetCapitalBdt)}
    </span>
  );
};

/** How many animals it keeps now. Nothing yet while it is Open, and nothing to keep once it was called off. */
const AnimalsCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  const { venture } = row.original;
  if (venture.state === "open" || venture.state === "cancelled") {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      {formatNumber(venture.animalsStanding ?? 0, language)}
    </span>
  );
};

/** The day an Open run has to be decided by. Once it is buying the day is behind it, and a date that no longer
 *  asks anything of her is left out rather than read as a deadline. */
const DecideByCell = ({ row }: Cell) => {
  const { venture } = row.original;
  if (venture.state !== "open") {
    return <Nothing />;
  }
  return (
    <span className="tabular-nums">
      <SaidDate at={venture.decideBy} />
    </span>
  );
};

/**
 * The selling window, as short as it will go: "17–27 February 2027" within one month, both dates in full
 * across two. Written out whole it is the widest cell in the row, and the row has to fit a laptop.
 */
const saidWindow = (
  window: { start: string; end: string },
  language: Language
) => {
  const start = startOfFarmDay(window.start);
  const end = startOfFarmDay(window.end);
  const sameMonth = window.start.slice(0, 7) === window.end.slice(0, 7);
  if (!sameMonth) {
    return `${formatDate(start, language, "date")} – ${formatDate(end, language, "date")}`;
  }
  const day = (on: string) => formatNumber(Number(on.slice(8, 10)), language);
  return `${day(window.start)}–${day(window.end)} ${formatDate(end, language, "monthYear")}`;
};

const WindowCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  return (
    <span className="tabular-nums">
      {saidWindow(row.original.venture.targetWindow, language)}
    </span>
  );
};

/** What the Investors have put in — the way to every movement of it, as it is on the card — and, while the
 *  run is Open, the Floor it is being measured against, since that is the figure buying waits on. */
const HeldCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const { venture, acts } = row.original;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        aria-label={t("ventures.movements")}
        className="rounded-md tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        onClick={() => acts.seeMovements(venture)}
        type="button"
      >
        {taka(venture.capitalInBdt)}
      </button>
      {venture.state === "open" ? (
        <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
          {t("ventures.ofTheFloor", { floor: taka(venture.floorBdt) })}
        </span>
      ) : null}
    </span>
  );
};

const BalanceCell = ({ row }: Cell) => {
  const taka = useTaka();
  return (
    <span className="tabular-nums">
      {taka(moneyOf(row.original.venture).balanceBdt)}
    </span>
  );
};

/** How many of its Units are signed for, out of how many there are. */
const UnitsCell = ({ row }: Cell) => {
  const { t, language } = useLanguage();
  const { venture } = row.original;
  return (
    <span className="tabular-nums">
      {t("ventures.page.unitsOf", {
        taken: formatNumber(moneyOf(venture).signedFor.units, language),
        units: formatNumber(venture.units, language),
      })}
    </span>
  );
};

/** How many people have signed for it. Its own column, so the runs can be sorted by it. */
const PeopleCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  return (
    <span className="tabular-nums">
      {formatNumber(moneyOf(row.original.venture).signedFor.people, language)}
    </span>
  );
};

/** The act the run is waiting for, and the menu holding everything else it can do. What stands in the way of
 *  a dim one is said under the run's name. */
const ActsCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const { venture, acts } = row.original;
  return (
    <div className="flex items-start justify-end gap-1">
      {/* One above the other, so the column is as wide as one button rather than two. */}
      <div className="flex flex-col items-stretch gap-1">
        <PrimaryActs acts={acts} dense venture={venture} />
      </div>
      <RowMenu
        actions={actsInTheMenu(venture, acts, t)}
        label={t("ventures.moreFor", { venture: venture.name })}
      />
    </div>
  );
};

const column = createListColumns<VentureRow>();
const ventureColumns = column.columns([
  column.accessor((row) => row.venture.name, {
    id: "venture",
    header: listHeader("ventures.col.venture"),
    cell: VentureCell,
    meta: { className: "min-w-56" },
  }),
  column.accessor((row) => row.venture.targetCapitalBdt, {
    id: "target",
    header: listHeader("ventures.target"),
    cell: TargetCell,
    meta: { align: "end", className: "whitespace-nowrap" },
  }),
  column.accessor((row) => row.venture.capitalInBdt, {
    id: "held",
    header: listHeader("ventures.held"),
    cell: HeldCell,
    meta: { align: "end", className: "whitespace-nowrap" },
  }),
  column.accessor((row) => moneyOf(row.venture).balanceBdt, {
    id: "balance",
    header: listHeader("ventures.balance"),
    cell: BalanceCell,
    meta: { align: "end", className: "whitespace-nowrap" },
  }),
  column.accessor((row) => moneyOf(row.venture).signedFor.units, {
    id: "units",
    header: listHeader("ventures.col.unitsSigned"),
    cell: UnitsCell,
    meta: { align: "end", className: "whitespace-nowrap" },
  }),
  column.accessor((row) => moneyOf(row.venture).signedFor.people, {
    id: "people",
    header: listHeader("ventures.col.people"),
    cell: PeopleCell,
    meta: { align: "end", className: "whitespace-nowrap" },
  }),
  column.accessor((row) => row.venture.animalsStanding ?? undefined, {
    id: "animals",
    header: listHeader("ventures.col.animals"),
    cell: AnimalsCell,
    meta: { align: "end", className: "whitespace-nowrap" },
  }),
  column.accessor((row) => row.venture.decideBy, {
    id: "decideBy",
    header: listHeader("ventures.decideBy"),
    cell: DecideByCell,
    meta: { className: "whitespace-nowrap" },
  }),
  column.accessor((row) => row.venture.targetWindow.start, {
    id: "window",
    header: listHeader("ventures.window"),
    cell: WindowCell,
    meta: { className: "whitespace-nowrap" },
  }),
  column.display({
    id: "acts",
    header: ActionsHeader,
    cell: ActsCell,
    // Pinned to the right edge: when the figures scroll on a narrow screen, the act the run is waiting for
    // stays in reach instead of scrolling away with them.
    meta: {
      align: "end",
      className: "bg-card sticky right-0 z-10 w-36 border-l",
    },
  }),
]);

/** A Venture on a phone, where a row of six columns is a row nobody can read: the card it has always been,
 *  inside the list's own line rather than in a box of its own. */
const ventureCard = (row: VentureRow) => (
  <VentureCard
    acts={row.acts}
    bare
    lastMonthOver={row.lastMonthOver}
    venture={row.venture}
  />
);

/**
 * The Ventures on one tab as a table: what each is called and where it stands, what its Investors have put
 * in, what its account should hold, how many Units are signed and by how many people, and how the bank
 * stands — with the act it is waiting for at the end of its row, and everything else in the menu beside it.
 *
 * Sortable by every figure, because the question a table answers is which of them, and the rest of what a
 * Venture is opens from its name.
 */
export const VenturesTable = ({
  ventures,
  acts,
  lastMonthOver,
}: {
  ventures: Venture[];
  acts: VentureActs;
  lastMonthOver: string;
}) => {
  const table = useListTable({
    columns: ventureColumns,
    data: ventures.map((venture) => ({ venture, acts, lastMonthOver })),
    getRowId: (row) => row.venture.id,
  });
  // As narrow as the row can honestly go — a 1366-pixel laptop's page, beside the sidebar — before it scrolls.
  return <DataTable card={ventureCard} minWidth="60rem" table={table} />;
};
