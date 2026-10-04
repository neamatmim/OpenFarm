import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
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
import { Fragment, useState } from "react";

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

/** A row's state for its look: ticked rows are shaded as selected, an opened one as open. */
const rowState = (ticked: boolean, open: boolean) => {
  if (ticked) {
    return "selected";
  }
  return open ? "open" : undefined;
};

/** What a page ticks rows for: the ids ticked, how a tick changes them, which rows may be ticked at all, and what a
 *  screen reader hears for a row's box. */
export interface RowSelection<TData> {
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  selectable: (row: TData) => boolean;
  label: (row: TData) => string;
}

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

/** Joins the sort arrow to the heading's last word, so it is never left on a line of its own. */
const WORD_JOINER = "\u2060";

/**
 * One column's heading: a button that sorts by it where the column sorts, its name alone where it does not.
 *
 * The arrow runs in the heading's own line of text, after its last word, rather than beside the heading as a box of
 * its own: beside it, a heading that wrapped stretched the box across the column and left its arrow alone at the far
 * edge, halfway up, where it read as the next column's.
 */
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
        "hover:text-foreground -mx-1 rounded px-1 text-start outline-none focus-visible:ring-2",
        column.columnDef.meta?.align === "end" && "text-end",
        sorted && "text-foreground"
      )}
      onClick={column.getToggleSortingHandler()}
      type="button"
    >
      <FlexRender header={header} />
      <span className="whitespace-nowrap">
        {WORD_JOINER}
        <SortIcon
          aria-hidden
          className={cn(
            "ms-1 inline-block size-3.5 align-[-0.125em]",
            !sorted && "opacity-50"
          )}
        />
      </span>
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
          className="size-11 md:size-8"
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
          className="size-11 md:size-8"
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
 *
 * A row that opens to a breakdown — a buyer's sales and payments under what he owes — gives `renderDetail`: a button at
 * the row's start opens it under the row, across the whole table (Carbon's expandable data table), so the list stays
 * one line a record to read down and the breakdown is a press away. The phone's cards carry their breakdown as before.
 *
 * A list with a job done to many rows at once gives `selection`: a box at each row's start the page may tick, and one
 * in the heading for every row on this page (Carbon's batch selection). The page keeps what is ticked and says what to
 * do with it; a row it says may not be ticked has no box.
 */
export const DataTable = <TData extends object>({
  table,
  card,
  minWidth = "40rem",
  bare = false,
  pageSize,
  className,
  renderDetail,
  selection,
}: {
  table: TableInstance<ListFeatures, TData>;
  card?: (row: TData) => ReactNode;
  renderDetail?: (row: TData) => ReactNode;
  selection?: RowSelection<TData>;
  minWidth?: string;
  bare?: boolean;
  pageSize?: number;
  className?: string;
}) => {
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const t = useT();
  const toggle = (id: string) =>
    setOpened((was) => {
      const now = new Set(was);
      if (!now.delete(id)) {
        now.add(id);
      }
      return now;
    });
  const all = table.getRowModel().rows;
  const size = pageSize ?? all.length;
  const pages = Math.max(1, Math.ceil(all.length / Math.max(size, 1)));
  // A list that shrank under a filter keeps its reader on a page that still exists.
  const shown = Math.min(page, pages - 1);
  const rows = pageSize
    ? all.slice(shown * pageSize, (shown + 1) * pageSize)
    : all;
  const paged = pageSize !== undefined && all.length > pageSize;
  const tickable = selection
    ? rows.filter((row) => selection.selectable(row.original))
    : [];
  const ticked = tickable.filter((row) => selection?.selected.has(row.id));
  // Every box on this page ticked, or some of them: the heading's box says which.
  const allTicked = ticked.length > 0 && ticked.length === tickable.length;
  const someTicked = ticked.length > 0 && !allTicked;
  const tickPage = (on: boolean) => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    for (const row of tickable) {
      if (on) {
        next.add(row.id);
      } else {
        next.delete(row.id);
      }
    }
    selection.onChange(next);
  };
  const tickRow = (id: string, on: boolean) => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    selection.onChange(next);
  };
  const leadingCells = (selection ? 1 : 0) + (renderDetail ? 1 : 0);
  return (
    <>
      {card ? (
        <ul className="divide-border flex flex-col divide-y md:hidden">
          {rows.map((row) => (
            <li className="flex min-w-0 items-start gap-3 py-3" key={row.id}>
              {/* Ticked on a phone as at a desk: a job done to many is as much a phone's. */}
              {selection?.selectable(row.original) ? (
                <Checkbox
                  aria-label={selection.label(row.original)}
                  checked={selection.selected.has(row.id)}
                  className="mt-1"
                  onCheckedChange={(on) => tickRow(row.id, on)}
                />
              ) : null}
              <div className="min-w-0 flex-1">{card(row.original)}</div>
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
        <Table
          // A long list read a page at a time keeps its headings in sight as it is scrolled (Fiori: a table's column
          // headers are sticky). On a desk it scrolls inside a box the window's height, so the heading row has
          // something to stick to; a phone reads the cards above. A row tabbed to stops below the pinned heading,
          // not under it (WCAG 2.4.11): the box keeps the heading's height clear as it scrolls.
          containerClassName={
            paged
              ? "md:max-h-[calc(100dvh-12rem)] md:overflow-y-auto md:scroll-pt-10"
              : undefined
          }
          style={{ minWidth }}
        >
          <TableHeader
            className={cn(paged && "md:bg-card md:sticky md:top-0 md:z-10")}
          >
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {selection ? (
                  <TableHead className="w-10 pl-4 md:pl-5">
                    {tickable.length > 0 ? (
                      <Checkbox
                        aria-label={t("common.selectPage")}
                        checked={allTicked}
                        indeterminate={someTicked}
                        onCheckedChange={(on) => tickPage(on)}
                      />
                    ) : null}
                  </TableHead>
                ) : null}
                {renderDetail ? (
                  <TableHead className="w-12 pl-4 md:pl-5">
                    <span className="sr-only">{t("common.col.details")}</span>
                  </TableHead>
                ) : null}
                {group.headers.map((header) => {
                  const look = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                      className={cn(
                        // One line, as a list's headings are read across: sentence case and the small size keep them
                        // short enough that the figures under them still say how wide a column is. (They wrapped while
                        // they were capitals, which pushed the Ventures table off its card; the table scrolls sideways
                        // on its own rather than the page, where one is still too wide.)
                        "text-muted-foreground align-bottom text-xs whitespace-nowrap first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5",
                        look?.align === "end" && "text-right",
                        look?.className,
                        // Last, so a column that lets its figures wrap does not wrap its heading with them.
                        "whitespace-nowrap"
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
            {rows.map((row) => {
              const isOpen = opened.has(row.id);
              const detailId = `row-detail-${row.id}`;
              return (
                <Fragment key={row.id}>
                  <TableRow
                    data-state={rowState(
                      selection?.selected.has(row.id) ?? false,
                      isOpen
                    )}
                  >
                    {selection ? (
                      <TableCell className="w-10 pl-4 align-top md:pl-5">
                        {selection.selectable(row.original) ? (
                          <Checkbox
                            aria-label={selection.label(row.original)}
                            checked={selection.selected.has(row.id)}
                            className="mt-0.5"
                            onCheckedChange={(on) => tickRow(row.id, on)}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    {renderDetail ? (
                      <TableCell className="w-12 pl-4 align-top md:pl-5">
                        <Button
                          aria-controls={detailId}
                          aria-expanded={isOpen}
                          aria-label={t(
                            isOpen ? "common.hideDetails" : "common.showDetails"
                          )}
                          onClick={() => toggle(row.id)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "transition-transform motion-reduce:transition-none",
                              isOpen && "rotate-90"
                            )}
                          />
                        </Button>
                      </TableCell>
                    ) : null}
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
                  {renderDetail && isOpen ? (
                    <TableRow className="hover:bg-transparent" id={detailId}>
                      <TableCell
                        className="bg-muted/40 px-4 py-4 whitespace-normal md:px-5"
                        colSpan={row.getAllCells().length + leadingCells}
                      >
                        {renderDetail(row.original)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
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
