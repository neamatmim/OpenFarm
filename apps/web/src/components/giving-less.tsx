import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { TrendingDown } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { Nothing } from "@/components/list-cells";
import { Section, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** A cow giving well under her own week, as the Manager's queue and the Milk page are told it. */
export type GivingLessRows = Awaited<
  ReturnType<typeof orpc.milk.givingLess.call>
>;

/**
 * Cows in milk giving well under their own week, the furthest under first: liters a milking lately and usually, how far
 * under, and how long she has been in milk, each opening her page. A sudden drop is often the first sign of mastitis,
 * milk fever or ketosis — and a heat drops milk too.
 */
export const GivingLessGroup = ({
  rows,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before the list. */
  rows: GivingLessRows | undefined;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const items = (rows ?? []).map((row) => (
    <QueueRow
      key={row.animalId}
      meta={t("givingLess.line", {
        lately: formatNumber(row.lately, language),
        usually: formatNumber(row.usually, language),
        drop: row.dropPercent,
        pen: row.penName,
      })}
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ tagNumber: row.tag }}
          to="/animals/$tagNumber"
        >
          {row.tag}
        </Link>
      }
      trailing={<Opens />}
    />
  ));
  if (items.length === 0) {
    return null;
  }
  return (
    <QueueGroup
      headless={headless}
      icon={TrendingDown}
      label={t("givingLess.title")}
      rows={items}
      tone="warning"
    />
  );
};

type GivingLessRow = GivingLessRows[number];

interface Cell {
  row: { original: GivingLessRow };
}

const TagCell = ({ row }: Cell) => (
  <Link params={{ tagNumber: row.original.tag }} to="/animals/$tagNumber">
    <TagChip>{row.original.tag}</TagChip>
  </Link>
);
const Liters = ({ liters }: { liters: number }) => {
  const { language } = useLanguage();
  return <span>{formatNumber(liters, language)}</span>;
};
const LatelyCell = ({ row }: Cell) => <Liters liters={row.original.lately} />;
const UsuallyCell = ({ row }: Cell) => <Liters liters={row.original.usually} />;
const DropCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  return (
    <span className="text-warning font-medium">
      {`${formatNumber(row.original.dropPercent, language)}%`}
    </span>
  );
};
const DaysInMilkCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  const days = row.original.daysInMilk;
  return days === null ? (
    <Nothing />
  ) : (
    <span>{formatNumber(days, language)}</span>
  );
};

const column = createListColumns<GivingLessRow>();
const givingLessColumns = column.columns([
  column.accessor("tag", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", { header: listHeader("herd.col.pen") }),
  column.accessor((row) => row.daysInMilk ?? undefined, {
    id: "daysInMilk",
    header: listHeader("givingLess.col.daysInMilk"),
    cell: DaysInMilkCell,
    meta: { align: "end" },
  }),
  column.accessor("usually", {
    header: listHeader("givingLess.col.usually"),
    cell: UsuallyCell,
    meta: { align: "end" },
  }),
  column.accessor("lately", {
    header: listHeader("givingLess.col.lately"),
    cell: LatelyCell,
    meta: { align: "end" },
  }),
  column.accessor("dropPercent", {
    header: listHeader("givingLess.col.drop"),
    cell: DropCell,
    meta: { align: "end" },
  }),
]);

const GivingLessTable = ({ rows }: { rows: GivingLessRows }) => {
  const table = useListTable({
    columns: givingLessColumns,
    data: rows,
    getRowId: (row) => row.animalId,
  });
  return <DataTable table={table} />;
};

/**
 * The Milk page's list of cows giving less. A phone keeps the queue's lines; a desk reads them as a table — Tag
 * Number, Pen, days in milk, and liters a milking usually, lately and how far under — sortable, the furthest under
 * first (Polaris's index table).
 */
export const GivingLessList = ({ rows }: { rows: GivingLessRows }) => (
  <>
    <div className="md:hidden">
      <GivingLessGroup headless rows={rows} />
    </div>
    <Section className="hidden md:flex">
      <GivingLessTable rows={rows} />
    </Section>
  </>
);
