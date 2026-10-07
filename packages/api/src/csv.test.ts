import { describe, expect, it } from "vitest";

import { parseCsv, parseCsvRecords, toCsv } from "./csv";

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

describe("the CSV writer", () => {
  it("keeps a long reference and a number beginning 0 as the text they are", () => {
    const written = toCsv(
      ["reference", "phone", "amount", "tag"],
      [["202610071234567890123", "01711000222", "4500", "F-0012"]]
    );
    const [, row] = written.replace("﻿", "").split("\r\n");
    expect(row).toBe(
      '"=""202610071234567890123""","=""01711000222""",4500,F-0012'
    );
  });
});
