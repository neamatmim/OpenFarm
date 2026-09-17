import type { MessageKey } from "@OpenFarm/i18n";
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
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { useT } from "@/i18n/language-provider";

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
} = createTableHook({ features: listFeatures });

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

/**
 * A list as a table where there is room for one, and as the page's own cards on a phone, where a row of six columns
 * is a row nobody can read. Without `card` the table is all there is, scrolling sideways on a phone.
 *
 * Inside a `Section` the table runs to the card's edges; `bare` keeps it within its own box elsewhere.
 */
export const DataTable = <TData extends object>({
  table,
  card,
  minWidth = "40rem",
  bare = false,
  className,
}: {
  table: TableInstance<ListFeatures, TData>;
  card?: (row: TData) => ReactNode;
  minWidth?: string;
  bare?: boolean;
  className?: string;
}) => {
  const { rows } = table.getRowModel();
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
    </>
  );
};
