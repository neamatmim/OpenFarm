import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The Farm's money changes in three places and no others, so a Closed Month (ADR 0028) is asked about every change:
// `bookMoney` and `putMoneyRight` (money-store) and `takeOffTheBooks` (closed-month-store). The Owner's approval in
// routers/money writes who approved and when, never a figure. A Money Event written anywhere else would change a month
// the Owner has closed without refusing anybody else or telling the next paper.
const SOURCE = import.meta.dirname;
const MAY_WRITE_MONEY = new Set([
  "money-store.ts",
  "closed-month-store.ts",
  path.join("routers", "money.ts"),
]);
const WRITES_MONEY = /\.\s*(?:update|insert|delete)\s*\(\s*moneyEvent\s*\)/u;

const sources = readdirSync(SOURCE, { recursive: true, encoding: "utf-8" })
  .filter(
    (name) =>
      name.endsWith(".ts") &&
      !name.includes(".test.") &&
      !name.includes("node_modules") &&
      !name.startsWith(path.join("seed", ""))
  )
  .map(
    (name) => [name, readFileSync(path.join(SOURCE, name), "utf-8")] as const
  );

describe("where the Farm's money is written", () => {
  it("reads the stores and the routers both", () => {
    const names = sources.map(([name]) => name);
    expect(names).toContain("money-store.ts");
    expect(names).toContain(path.join("corrections", "vet-fee.ts"));
  });

  it("is written only where a Closed Month is asked about it", () => {
    expect(
      sources
        .filter(
          ([name, source]) =>
            !MAY_WRITE_MONEY.has(name) && WRITES_MONEY.test(source)
        )
        .map(([name]) => name)
    ).toEqual([]);
  });
});
