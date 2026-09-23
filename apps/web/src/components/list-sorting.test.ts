import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createListColumns, useListTable } from "./data-table";

// A list sorted by a column some rows have nothing in: the Lot with no expiry, the product never bought. Those rows
// go to the bottom whichever way the column is sorted — they are not the smallest value, or the largest, but none.

interface Row {
  id: string;
  lastBought: number | undefined;
}

const column = createListColumns<Row>();
const columns = column.columns([
  column.accessor((row) => row.lastBought, { id: "lastBought" }),
]);

const DATA: Row[] = [
  { id: "never", lastBought: undefined },
  { id: "june", lastBought: 6 },
  { id: "march", lastBought: 3 },
];

/** The list as the table hook sorts it, read off one render. */
const Sorted = ({ desc }: { desc: boolean }) => {
  const table = useListTable({
    columns,
    data: DATA,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ id: "lastBought", desc }] },
  });
  return table
    .getRowModel()
    .rows.map((row) => row.id)
    .join(",");
};

const sortedIds = (desc: boolean) =>
  renderToString(createElement(Sorted, { desc })).split(",");

describe("a list sorted by a column some rows leave empty", () => {
  it("puts the empty rows last going up", () => {
    expect(sortedIds(false)).toEqual(["march", "june", "never"]);
  });

  it("and last going down", () => {
    expect(sortedIds(true)).toEqual(["june", "march", "never"]);
  });
});
