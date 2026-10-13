import { describe, expect, it } from "vitest";

import { owedSuppliersIn } from "./owed-to-suppliers";

const owing = (owingMoney: number) => ({
  atEnd: { owedToSuppliers: { owingMoney } },
});

describe("whether a month page says what the farm owed its suppliers", () => {
  it("says it where this month or the month before owed them something", () => {
    expect(owedSuppliersIn(owing(38_000), owing(0))).toBe(true);
    expect(owedSuppliersIn(owing(0), owing(5000))).toBe(true);
  });

  it("leaves it out where neither month owed them anything, or the phone kept a month from before it was said", () => {
    expect(owedSuppliersIn(owing(0), owing(0))).toBe(false);
    expect(owedSuppliersIn({ atEnd: {} }, {})).toBe(false);
  });
});
