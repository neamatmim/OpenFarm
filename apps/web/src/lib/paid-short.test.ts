import { describe, expect, it } from "vitest";

import { paidLooksShort } from "./paid-short";

// The Owner's "Paid" cell on a Venture's investors: in the warning's color only when the Investor is behind. Paid by
// the month, nobody reaches the whole price until the last sum, so a cell colored for that is colored all season and
// hides the one who has missed a sum.

describe("whether a Venture investor's paid figure is said as short", () => {
  it("is short paid before buying until it agrees with what the Units are worth", () => {
    expect(
      paidLooksShort({ paidMoney: 50_000, owedMoney: 58_000, monthly: false })
    ).toBe(true);
    expect(
      paidLooksShort({ paidMoney: 58_000, owedMoney: 58_000, monthly: false })
    ).toBe(false);
  });

  it("is not short paid by the month while no sum is missed, though the price is not all in", () => {
    expect(
      paidLooksShort({
        paidMoney: 46_000,
        owedMoney: 58_000,
        monthly: true,
        sums: { missedMoney: 0 },
      })
    ).toBe(false);
  });

  it("is short paid by the month once a sum is missed", () => {
    expect(
      paidLooksShort({
        paidMoney: 40_000,
        owedMoney: 58_000,
        monthly: true,
        sums: { missedMoney: 6000 },
      })
    ).toBe(true);
  });

  it("is not short paid by the month while it gathers and no sum has a standing yet", () => {
    expect(
      paidLooksShort({
        paidMoney: 0,
        owedMoney: 58_000,
        monthly: true,
        sums: null,
      })
    ).toBe(false);
  });
});
