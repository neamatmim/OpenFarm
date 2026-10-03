import { describe, expect, it } from "vitest";

import { soldUnder } from "./animal-price";

const range = { lowMoneyPerKg: 520, highMoneyPerKg: 580 };

describe("a sale under her cost or the market", () => {
  it("is under cost when it fetched less than she cost", () => {
    expect(
      soldUnder({
        priceMoney: 150_000,
        costMoney: 160_000,
        weightKg: 400,
        range,
      })
    ).toEqual({ underCost: true, underMarket: true, lowMoney: 208_000 });
  });

  it("is under the market when it fetched less than her weight at the low price, even over her cost", () => {
    expect(
      soldUnder({
        priceMoney: 200_000,
        costMoney: 150_000,
        weightKg: 400,
        range,
      })
    ).toEqual({ underCost: false, underMarket: true, lowMoney: 208_000 });
  });

  it("is neither at or over both, and never under a market nobody set", () => {
    expect(
      soldUnder({
        priceMoney: 210_000,
        costMoney: 150_000,
        weightKg: 400,
        range,
      })
    ).toEqual({ underCost: false, underMarket: false, lowMoney: 208_000 });
    expect(
      soldUnder({
        priceMoney: 150_000,
        costMoney: 100_000,
        weightKg: 400,
        range: null,
      })
    ).toEqual({ underCost: false, underMarket: false, lowMoney: null });
  });
});
