import type { Age } from "@OpenFarm/domain";
import { Link } from "@tanstack/react-router";
import { Beef, ChevronRight, Milk } from "lucide-react";

import { AnimalPhoto } from "@/components/animal-photo";
import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { useLanguage } from "@/i18n/language-provider";

import { HeldBadges, SideWord, StateBadge, ageWords } from "./animal-words";

/** How many animals a page of the herd shows: enough for a Pen at a glance, few enough that a herd of five hundred
 *  does not fetch five hundred photographs at once. */
const PAGE = 50;

/** One animal as the herd lists her: what she is, where she stands, and anything holding her back. */
export interface HerdRow {
  id: string;
  tagNumber: string;
  officialTag: string | null;
  penId: string | null;
  state: string;
  side: "dairy" | "fattening";
  penName: string;
  breed: string | null;
  age: Age | null;
  photoUpdatedAt: Date | null;
  milkHeld: boolean;
  meatHeld: boolean;
}

/** Her photo where one was taken; otherwise her Side's mark in the same place, so the numbers down a list still line
 *  up — her digits are already beside it. */
const Likeness = ({ row, size }: { row: HerdRow; size: number }) => {
  if (row.photoUpdatedAt) {
    return (
      <AnimalPhoto
        photoUpdatedAt={row.photoUpdatedAt}
        size={size}
        tagNumber={row.tagNumber}
      />
    );
  }
  const Icon = row.side === "dairy" ? Milk : Beef;
  return (
    <span
      aria-hidden
      className="bg-secondary text-muted-foreground ring-border grid shrink-0 place-items-center rounded-xl ring-1"
      style={{ width: size, height: size }}
    >
      <Icon className="size-4" />
    </span>
  );
};

/** Her photo small beside her Tag Number, the number a link to her page. */
const TagCell = ({ row }: { row: { original: HerdRow } }) => (
  <Link
    className="group flex items-center gap-3 outline-none"
    params={{ tagNumber: row.original.tagNumber }}
    to="/animals/$tagNumber"
  >
    <Likeness row={row.original} size={36} />
    <span className="font-mono font-semibold tabular-nums underline-offset-4 group-hover:underline group-focus-visible:underline">
      {row.original.tagNumber}
    </span>
  </Link>
);

const StateCell = ({ row }: { row: { original: HerdRow } }) => (
  <StateBadge state={row.original.state} />
);

const SideCell = ({ row }: { row: { original: HerdRow } }) => (
  <SideWord side={row.original.side} />
);

const AgeCell = ({ row }: { row: { original: HerdRow } }) => {
  const { t } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {ageWords(t, row.original.age) ?? "—"}
    </span>
  );
};

const HeldCell = ({ row }: { row: { original: HerdRow } }) => (
  <HeldBadges
    meatHeld={row.original.meatHeld}
    milkHeld={row.original.milkHeld}
  />
);

const column = createListColumns<HerdRow>();
const herdColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("state", {
    header: listHeader("animals.state"),
    cell: StateCell,
  }),
  column.accessor("side", {
    header: listHeader("animals.side"),
    cell: SideCell,
  }),
  column.accessor("penName", { header: listHeader("animals.pen") }),
  column.accessor((a) => a.breed ?? "—", {
    id: "breed",
    header: listHeader("animals.breed"),
  }),
  column.accessor((a) => a.age?.months ?? undefined, {
    id: "age",
    header: listHeader("animals.age"),
    cell: AgeCell,
  }),
  column.accessor((a) => Number(a.milkHeld) + Number(a.meatHeld), {
    id: "held",
    header: listHeader("animals.col.held"),
    cell: HeldCell,
  }),
]);

/** An animal on a phone: her photo, her number and State on one line, her Side and Pen beneath, and what holds her
 *  back — the whole card a way to her page. */
const HerdCard = ({ row }: { row: HerdRow }) => {
  const { t } = useLanguage();
  const age = ageWords(t, row.age);
  return (
    <Link
      className="focus-visible:ring-ring -mx-1 flex min-h-11 items-center gap-3 rounded-lg px-1 outline-none focus-visible:ring-2"
      params={{ tagNumber: row.tagNumber }}
      to="/animals/$tagNumber"
    >
      <Likeness row={row} size={44} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold tabular-nums">
            {row.tagNumber}
          </span>
          <StateBadge state={row.state} />
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
          <span>{t(`animals.side.${row.side}`)}</span>
          <span className="truncate">{row.penName}</span>
          {age ? <span>{age}</span> : null}
        </span>
        <HeldBadges meatHeld={row.meatHeld} milkHeld={row.milkHeld} />
      </span>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </Link>
  );
};

const herdCard = (row: HerdRow) => <HerdCard row={row} />;

/** The herd as a table where there is room — her number, State, Side, Pen, breed and age side by side, sortable —
 *  and as cards on a phone, a page at a time either way. */
export const HerdTable = ({ rows }: { rows: HerdRow[] }) => {
  const table = useListTable({
    columns: herdColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <DataTable card={herdCard} minWidth="56rem" pageSize={PAGE} table={table} />
  );
};
