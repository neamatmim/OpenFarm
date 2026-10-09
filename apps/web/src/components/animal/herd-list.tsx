import type { Age } from "@OpenFarm/domain";
import { Link } from "@tanstack/react-router";
import { Beef, ChevronRight, Milk } from "lucide-react";

import { AnimalPhoto } from "@/components/animal-photo";
import type { RowLead, RowSelection } from "@/components/data-table";
import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

import { HeldBadges, SideWord, StateBadge, ageWords } from "./animal-words";

/** How many animals a page of the herd shows: enough for a Pen at a glance, few enough that a herd of five hundred
 *  does not fetch five hundred photographs at once. */
const PAGE = 50;

/** How big her photo is: beside her number in a desk's row, and leading a phone's card. */
const TABLE_LIKENESS = 36;
const CARD_LIKENESS = 44;

/** A row opens on her photo, so a ticked row's box sits level with its middle. */
const LIKENESS_LEAD: RowLead = {
  desk: `${TABLE_LIKENESS}px`,
  phone: `${CARD_LIKENESS}px`,
};

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
    className="focus-visible:ring-ring flex w-fit items-center gap-3 rounded-md outline-none hover:underline focus-visible:ring-2"
    params={{ tagNumber: row.original.tagNumber }}
    to="/animals/$tagNumber"
  >
    <Likeness row={row.original} size={TABLE_LIKENESS} />
    <TagChip>{row.original.tagNumber}</TagChip>
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

/** Every cell is one line, set level with the middle of her photo, which is taller than a line. */
const ON_THE_PHOTO = { middle: true };

const column = createListColumns<HerdRow>();
const herdColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    meta: ON_THE_PHOTO,
    cell: TagCell,
  }),
  column.accessor("state", {
    header: listHeader("animals.state"),
    meta: ON_THE_PHOTO,
    cell: StateCell,
  }),
  column.accessor("side", {
    header: listHeader("animals.side"),
    meta: ON_THE_PHOTO,
    cell: SideCell,
  }),
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    meta: ON_THE_PHOTO,
  }),
  column.accessor((a) => a.breed ?? "—", {
    id: "breed",
    header: listHeader("animals.breed"),
    meta: ON_THE_PHOTO,
  }),
  column.accessor((a) => a.age?.months ?? undefined, {
    id: "age",
    header: listHeader("animals.age"),
    meta: ON_THE_PHOTO,
    cell: AgeCell,
  }),
  column.accessor((a) => Number(a.milkHeld) + Number(a.meatHeld), {
    id: "held",
    header: listHeader("animals.col.held"),
    meta: ON_THE_PHOTO,
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
      <Likeness row={row} size={CARD_LIKENESS} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <TagChip>{row.tagNumber}</TagChip>
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
export const HerdTable = ({
  rows,
  selection,
}: {
  rows: HerdRow[];
  /** Animals ticked to be moved together, where this person may move any. */
  selection?: RowSelection<HerdRow>;
}) => {
  const table = useListTable({
    columns: herdColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <DataTable
      card={herdCard}
      minWidth="56rem"
      pageSize={PAGE}
      selection={selection && { ...selection, lead: LIKENESS_LEAD }}
      table={table}
    />
  );
};
