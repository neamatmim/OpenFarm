import { describe, expect, it } from "vitest";

import { soldUnder } from "./animal-price";

const range = { lowBdtPerKg: 520, highBdtPerKg: 580 };

describe("a sale under her cost or the market", () => {
  it("is under cost when it fetched less than she cost", () => {
    expect(
      soldUnder({ priceBdt: 150_000, costBdt: 160_000, weightKg: 400, range })
    ).toEqual({ underCost: true, underMarket: true, lowBdt: 208_000 });
  });

  it("is under the market when it fetched less than her weight at the low price, even over her cost", () => {
    expect(
      soldUnder({ priceBdt: 200_000, costBdt: 150_000, weightKg: 400, range })
    ).toEqual({ underCost: false, underMarket: true, lowBdt: 208_000 });
  });

  it("is neither at or over both, and never under a market nobody set", () => {
    expect(
      soldUnder({ priceBdt: 210_000, costBdt: 150_000, weightKg: 400, range })
    ).toEqual({ underCost: false, underMarket: false, lowBdt: 208_000 });
    expect(
      soldUnder({
        priceBdt: 150_000,
        costBdt: 100_000,
        weightKg: 400,
        range: null,
      })
    ).toEqual({ underCost: false, underMarket: false, lowBdt: null });
  });
});
