import { describe, expect, it } from "vitest";

import {
  payoutOf,
  priceAtWeight,
  splitOfProfit,
  unitsAltogether,
  unitsHeld,
  whatUnitsTake,
} from "./venture";

describe("splitting a Venture's profit", () => {
  it("gives the Investors their percentage and the Farm the rest", () => {
    // Two lakh profit, sixty per cent to the Investors, twenty Units between them.
    expect(
      splitOfProfit({ profitBdt: 200_000, investorsPercent: 60, units: 20 })
    ).toEqual({
      investorsBdt: 120_000,
      perUnitBdt: 6000,
      roundingBdt: 0,
      farmBdt: 80_000,
    });
  });

  it("floors the Unit and gives the Farm what flooring leaves over", () => {
    // 60% of 200,015 is 120,009, which will not divide twenty ways in whole taka.
    const split = splitOfProfit({
      profitBdt: 200_015,
      investorsPercent: 60,
      units: 20,
    });
    expect(split).toEqual({
      investorsBdt: 120_009,
      perUnitBdt: 6000,
      roundingBdt: 9,
      farmBdt: 80_015,
    });
    // Nothing is paid out that the account does not hold, and nothing is left with nobody: what the
    // Units take and what the Farm takes are the whole profit. The remainder is inside the Farm's line,
    // not beside it.
    expect(split.perUnitBdt * 20 + split.farmBdt).toBe(200_015);
  });

  it("divides a loss the same way, and says so as a negative", () => {
    const split = splitOfProfit({
      profitBdt: -100_000,
      investorsPercent: 60,
      units: 20,
    });
    expect(split).toEqual({
      investorsBdt: -60_000,
      perUnitBdt: -3000,
      roundingBdt: 0,
      farmBdt: -40_000,
    });
  });

  it("adds up whatever the profit is", () => {
    for (const profitBdt of [0, 1, -1, 999_999, -999_999, 123_457]) {
      const split = splitOfProfit({
        profitBdt,
        investorsPercent: 55,
        units: 17,
      });
      expect(split.perUnitBdt * 17 + split.farmBdt).toBe(profitBdt);
    }
  });

  it("keeps the whole profit where no Unit was ever signed for", () => {
    // Nobody signed, so there is nobody for the Investors' share to go to and all of it reads as what
    // flooring left over — which is the Farm's. A Venture in this state cannot reach a Settlement
    // anyway, but the arithmetic must not divide by nothing to find that out.
    expect(
      splitOfProfit({ profitBdt: 50_000, investorsPercent: 60, units: 0 })
    ).toEqual({
      investorsBdt: 30_000,
      perUnitBdt: 0,
      roundingBdt: 30_000,
      farmBdt: 50_000,
    });
  });
});

describe("what one Investor is paid", () => {
  it("is their capital back, and what their Units took", () => {
    expect(payoutOf(500_000, 10, 6000)).toBe(560_000);
  });

  it("takes a loss off the capital they get back", () => {
    expect(payoutOf(500_000, 10, -3000)).toBe(470_000);
  });
});

describe("the Units an Agreement holds", () => {
  it("is what it paid in over the Unit price, a part of a Unit included", () => {
    expect(unitsHeld(1_000_000, 50_000)).toBe(20);
    expect(unitsHeld(800_000, 50_000)).toBe(16);
    // Three Units' cattle money at forty thousand each, the running money still to come.
    expect(unitsHeld(120_000, 50_000)).toBe(2.4);
    expect(unitsHeld(0, 50_000)).toBe(0);
    expect(unitsHeld(800_000, 0)).toBe(0);
  });

  it("adds up to four places", () => {
    expect(unitsAltogether([0.1, 0.2])).toBe(0.3);
    expect(unitsAltogether([8, 2.4])).toBe(10.4);
  });

  it("takes whole Units exactly and a part floored, never a taka under for the arithmetic", () => {
    expect(whatUnitsTake(3750, 10)).toBe(37_500);
    expect(whatUnitsTake(3750, 9.6)).toBe(36_000);
    expect(whatUnitsTake(-3750, 9.6)).toBe(-36_000);
    expect(whatUnitsTake(100, 0.29)).toBe(29);
    expect(whatUnitsTake(-3751, 0.5)).toBe(-1876);
  });
});

describe("a split among holdings with part of a Unit", () => {
  it("floors each holding on its own and gives the paisa to the Farm's line", () => {
    // Ten Units paid for and 2.4: 60% of 10,000 over 12.4 Units is 483 a Unit.
    const split = splitOfProfit({
      profitBdt: 10_000,
      investorsPercent: 60,
      units: 12.4,
      held: [10, 2.4],
    });

    expect(split.perUnitBdt).toBe(483);
    // 4,830 and 1,159 (1,159.2 floored) taken between them.
    expect(split.roundingBdt).toBe(6000 - 4830 - 1159);
    expect(split.investorsBdt - split.roundingBdt + split.farmBdt).toBe(10_000);
  });
});

describe("what a weight is worth at a rate", () => {
  it("is her kilos by the taka a kilo, to the paisa", () => {
    expect(priceAtWeight(364, 300)).toBe(109_200);
    expect(priceAtWeight(364.5, 301.5)).toBe(109_896.75);
  });

  it("keeps the paisa rather than the fractions of one", () => {
    // The farm banks taka and paisa and nothing finer, and the server strikes the same figure before it
    // will take the sale — a third decimal here would refuse the Owner over arithmetic.
    expect(priceAtWeight(333.333, 3)).toBe(1000);
    expect(priceAtWeight(1, 0.005)).toBe(0.01);
  });

  it("is nothing for an animal nobody has weighed", () => {
    expect(priceAtWeight(0, 300)).toBe(0);
  });
});
