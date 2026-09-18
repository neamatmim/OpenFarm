import { payoutOf, splitOfProfit } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

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
