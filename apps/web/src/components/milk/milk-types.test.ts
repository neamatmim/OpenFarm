import { describe, expect, it } from "vitest";

import { milkMoneyOf, perLiterOf, worthOfRow } from "./milk-types";

describe("a Dispatch's milk money, as the day shows it", () => {
  it("is its liters at its price, its statement's figure once priced, and nothing while its price is to follow", () => {
    expect(
      worthOfRow({ liters: 10, pricePerLiterMoney: 55.5, worthMoney: 555 })
    ).toBe(555);
    expect(
      worthOfRow({ liters: 100, pricePerLiterMoney: null, worthMoney: 6000 })
    ).toBe(6000);
    expect(
      worthOfRow({ liters: 100, pricePerLiterMoney: null, worthMoney: null })
    ).toBeNull();
  });

  it("works it out from the price for a day kept from before the farm said what it came to", () => {
    expect(worthOfRow({ liters: 10, pricePerLiterMoney: 55.5 })).toBe(555);
  });

  it("says a liter of statement-priced milk at what it came to over its liters", () => {
    expect(
      perLiterOf({ liters: 150, pricePerLiterMoney: null, worthMoney: 9000 })
    ).toBe(60);
    expect(
      perLiterOf({ liters: 150, pricePerLiterMoney: null, worthMoney: null })
    ).toBeNull();
  });

  it("adds up the day's milk money, and the liters whose price is to follow apart", () => {
    expect(
      milkMoneyOf([
        { liters: 10, pricePerLiterMoney: 50, worthMoney: 500 },
        { liters: 40, pricePerLiterMoney: null, worthMoney: null },
        { liters: 5, pricePerLiterMoney: null, worthMoney: 310 },
      ])
    ).toEqual({ amount: 810, litersToFollow: 40 });
  });
});
