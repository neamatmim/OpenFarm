import { describe, expect, it } from "vitest";

import { moneyTotals, totalsPartial } from "./money-totals";

const ROWS = [
  { direction: "in", amountMoney: 500, approval: "approved" },
  { direction: "out", amountMoney: 200, approval: "awaiting" },
] as const;

describe("a period's money totals", () => {
  it("are the farm's, whatever the rows shown add up to", () => {
    const totals = { inMoney: 90_000, outMoney: 40_000, awaiting: 3 };
    expect(moneyTotals({ events: ROWS, totals })).toEqual(totals);
    expect(totalsPartial({ more: true, totals })).toBe(false);
  });

  it("are the rows added up in an answer kept from before the farm sent them, and say so when it was cut short", () => {
    expect(moneyTotals({ events: ROWS })).toEqual({
      inMoney: 500,
      outMoney: 200,
      awaiting: 1,
    });
    expect(totalsPartial({ more: true })).toBe(true);
    expect(totalsPartial({ more: false })).toBe(false);
  });
});
