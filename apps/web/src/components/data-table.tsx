import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { cn } from "@OpenFarm/ui/lib/utils";
import type {
  CellData,
  Header,
  Table as TableInstance,
} from "@tanstack/react-table";
import {
  FlexRender,
  createSortedRowModel,
  createTableHook,
  metaHelper,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useLanguage, useT } from "@/i18n/language-provider";

/** How a column sits in its table: figures line up on the right, and a column may carry its own classes. */
interface ColumnLook {
  align?: "end";
  className?: string;
}

const listFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
  columnMeta: metaHelper<ColumnLook>(),
});

/**
 * Every list the farm reads as rows — animals, people, dispatches, the audit trail — is built on these: the same
 * features, the same sorting, the same look. A page describes its columns with `createListColumns` and makes its
 * table with `useListTable`; `DataTable` draws it.
 */
export const {
  createAppColumnHelper: createListColumns,
  useAppTable: useListTable,
} = createTableHook({
  features: listFeatures,
  // A row with nothing in the column — a Lot with no expiry, a product never bought — is not the smallest value or
  // the largest but none, so it waits at the bottom whichever way the column is sorted. A column's value says
  // "nothing" as undefined, never as a made-up -1 or 9999-12-31.
  defaultColumn: { sortUndefined: "last" },
});

/** The features every list table has, for a component that is handed one. */
export type ListFeatures = typeof listFeatures;

/** A column's heading, in the reader's language. Columns are described once, outside any render, so the heading is
 *  a component of its own rather than a string worked out where the columns are made. */
export const listHeader = (key: MessageKey) => {
  const ListHeader = () => useT()(key);
  return ListHeader;
};

/** The heading over a row's buttons: nothing to see, since the buttons say what they do, but a screen reader moving
 *  along the header row still hears what the column is. */
export const ActionsHeader = () => (
  <span className="sr-only">{useT()("common.col.actions")}</span>
);

const SORT_ICON = { asc: ArrowUp, desc: ArrowDown } as const;

/** One column's heading: a button that sorts by it where the column sorts, its name alone where it does not. */
const Heading = <TData extends object>({
  header,
}: {
  header: Header<typeof listFeatures, TData, CellData>;
}) => {
  const { column } = header;
  if (header.isPlaceholder) {
    return null;
  }
  if (!column.getCanSort()) {
    return <FlexRender header={header} />;
  }
  const sorted = column.getIsSorted();
  const SortIcon = sorted ? SORT_ICON[sorted] : ChevronsUpDown;
  return (
    <button
      className={cn(
        "hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 outline-none focus-visible:ring-2",
        column.columnDef.meta?.align === "end" && "flex-row-reverse"
      )}
      onClick={column.getToggleSortingHandler()}
      type="button"
    >
      <FlexRender header={header} />
      <SortIcon
        aria-hidden
        className={cn("size-3.5", !sorted && "text-muted-foreground/60")}
      />
    </button>
  );
};

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/** Where a long list stands — which of how many — and the way to the page before and after. */
const Pager = ({
  from,
  to,
  total,
  onPrevious,
  onNext,
}: {
  from: number;
  to: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <nav
      aria-label={t("common.pages")}
      className="flex items-center justify-between gap-3 border-t pt-3 text-sm"
    >
      <span className="text-muted-foreground tabular-nums">
        {t("common.pager", {
          from: formatNumber(from, language),
          to: formatNumber(to, language),
          total: formatNumber(total, language),
        })}
      </span>
      <div className="flex gap-1">
        <Button
          aria-label={t("common.previousPage")}
          disabled={!onPrevious}
          onClick={onPrevious}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          aria-label={t("common.nextPage")}
          disabled={!onNext}
          onClick={onNext}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
};

/**
 * A list as a table where there is room for one, and as the page's own cards on a phone, where a row of six columns
 * is a row nobody can read. Without `card` the table is all there is, scrolling sideways on a phone.
 *
 * Inside a `Section` the table runs to the card's edges; `bare` keeps it within its own box elsewhere. A long history
 * gives a `pageSize`, and is read a page at a time in the order it is sorted.
 */
export const DataTable = <TData extends object>({
  table,
  card,
  minWidth = "40rem",
  bare = false,
  pageSize,
  className,
}: {
  table: TableInstance<ListFeatures, TData>;
  card?: (row: TData) => ReactNode;
  minWidth?: string;
  bare?: boolean;
  pageSize?: number;
  className?: string;
}) => {
  const [page, setPage] = useState(0);
  const all = table.getRowModel().rows;
  const size = pageSize ?? all.length;
  const pages = Math.max(1, Math.ceil(all.length / Math.max(size, 1)));
  // A list that shrank under a filter keeps its reader on a page that still exists.
  const shown = Math.min(page, pages - 1);
  const rows = pageSize
    ? all.slice(shown * pageSize, (shown + 1) * pageSize)
    : all;
  const paged = pageSize !== undefined && all.length > pageSize;
  return (
    <>
      {card ? (
        <ul className="divide-border flex flex-col divide-y md:hidden">
          {rows.map((row) => (
            <li className="min-w-0 py-3" key={row.id}>
              {card(row.original)}
            </li>
          ))}
        </ul>
      ) : null}
      <div
        className={cn(
          "overflow-x-auto",
          !bare && "-mx-4 md:-mx-5",
          card && "hidden md:block",
          className
        )}
      >
        <Table style={{ minWidth }}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const look = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                      className={cn(
                        "first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5",
                        look?.align === "end" && "text-right",
                        look?.className
                      )}
                      key={header.id}
                    >
                      <Heading header={header} />
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => {
                  const look = cell.column.columnDef.meta;
                  return (
                    <TableCell
                      className={cn(
                        "align-top whitespace-normal first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5",
                        look?.align === "end" && "text-right tabular-nums",
                        look?.className
                      )}
                      key={cell.id}
                    >
                      <FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {paged ? (
        <Pager
          from={shown * size + 1}
          onNext={shown < pages - 1 ? () => setPage(shown + 1) : undefined}
          onPrevious={shown > 0 ? () => setPage(shown - 1) : undefined}
          to={Math.min((shown + 1) * size, all.length)}
          total={all.length}
        />
      ) : null}
    </>
  );
};
