import { describe, expect, it } from "vitest";

import { parseCsv, parseCsvRecords } from "./csv";

describe("the CSV reader", () => {
  it("reads quoted fields, doubled quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x,y","he said ""no"""\r\n');

    expect(rows.map((r) => r.values)).toEqual([
      ["a", "b"],
      ["x,y", 'he said "no"'],
    ]);
  });

  it("treats a quote after spaces as opening the field", () => {
    const [row] = parseCsv('a, "b,c"');

    expect(row?.values).toEqual(["a", "b,c"]);
  });

  it("reports the source line, so a blank line does not shift the numbers", () => {
    const records = parseCsvRecords(["name", "first", "", "second"].join("\n"));

    expect(records.map((r) => [r.line, r.values.name])).toEqual([
      [2, "first"],
      [4, "second"],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    const records = parseCsvRecords('note\n"two\nlines"\nafter');

    expect(records[0]?.values.note).toBe("two\nlines");
    expect(records[1]?.line).toBe(4);
  });
});
