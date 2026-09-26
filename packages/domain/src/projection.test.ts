import { describe, expect, it } from "vitest";

import { projectedSettlement } from "./projection";
import { splitOfProfit } from "./venture";

describe("a Projection", () => {
  it("prices the herd at the low and the high price, and divides each as a Settlement would", () => {
    // Three thousand kilos at the window, twelve lakh charged, sixty per cent to twenty Units. At ৳450 a kilo the
    // herd fetches 13.5 lakh and makes 1.5 lakh; at ৳550 it fetches 16.5 lakh and makes 4.5 lakh.
    const projected = projectedSettlement({
      kgAtSale: 3000,
      realisedBdt: 0,
      chargedBdt: 1_200_000,
      investorsPercent: 60,
      units: 20,
      saleLowBdtPerKg: 450,
      saleHighBdtPerKg: 550,
    });

    expect(projected.low).toMatchObject({
      proceedsBdt: 1_350_000,
      profitBdt: 150_000,
      perUnitBdt: 4500,
    });
    expect(projected.high).toMatchObject({
      proceedsBdt: 1_650_000,
      profitBdt: 450_000,
      perUnitBdt: 13_500,
    });
  });

  it("is the Settlement's own split of the profit it comes to, not a sum of its own", () => {
    const projected = projectedSettlement({
      kgAtSale: 2999.7,
      realisedBdt: 12_345,
      chargedBdt: 1_200_000,
      investorsPercent: 55,
      units: 17,
      saleLowBdtPerKg: 452,
      saleHighBdtPerKg: 553,
    });
    for (const side of [projected.low, projected.high]) {
      expect(side).toMatchObject(
        splitOfProfit({
          profitBdt: side.profitBdt,
          investorsPercent: 55,
          units: 17,
        })
      );
    }
  });

  it("counts what the animals already sold fetched, at what they fetched", () => {
    // Half a lakh from animals already on a buyer's lorry comes in at both ends, whatever the price to come.
    const projected = projectedSettlement({
      kgAtSale: 1000,
      realisedBdt: 50_000,
      chargedBdt: 400_000,
      investorsPercent: 60,
      units: 10,
      saleLowBdtPerKg: 400,
      saleHighBdtPerKg: 500,
    });
    expect(projected.low.proceedsBdt).toBe(450_000);
    expect(projected.high.proceedsBdt).toBe(550_000);
  });

  it("says a loss where the low price comes to one, divided as a loss is", () => {
    // At ৳350 the three thousand kilos fetch 10.5 lakh against twelve lakh charged: 1.5 lakh lost, of which the
    // Investors' sixty per cent comes off their capital at ৳4,500 a Unit.
    const projected = projectedSettlement({
      kgAtSale: 3000,
      realisedBdt: 0,
      chargedBdt: 1_200_000,
      investorsPercent: 60,
      units: 20,
      saleLowBdtPerKg: 350,
      saleHighBdtPerKg: 450,
    });
    expect(projected.low.profitBdt).toBe(-150_000);
    expect(projected.low.perUnitBdt).toBe(-4500);
  });
});

describe("a Projection that allows for deaths", () => {
  it("sells fewer at the low end by the share expected to die, and still charges what they cost", () => {
    // Five per cent of the herd not living to be sold: 2,850 of the 3,000 kilos at ৳450 fetch ৳12,82,500, against the
    // same twelve lakh charged — a profit of ৳82,500. The high end is every animal living: 3,000 kilos at ৳550.
    const projected = projectedSettlement({
      kgAtSale: 3000,
      realisedBdt: 0,
      chargedBdt: 1_200_000,
      investorsPercent: 60,
      units: 20,
      saleLowBdtPerKg: 450,
      saleHighBdtPerKg: 550,
      deathsPercent: 5,
    });
    expect(projected.low).toMatchObject({
      kgAtSale: 2850,
      proceedsBdt: 1_282_500,
      profitBdt: 82_500,
    });
    expect(projected.high).toMatchObject({
      kgAtSale: 3000,
      proceedsBdt: 1_650_000,
      profitBdt: 450_000,
    });
  });

  it("never takes deaths off what was already sold", () => {
    // Half a lakh already fetched; ten per cent of the 1,000 kilos still to sell does not live: 900 at ৳400.
    const projected = projectedSettlement({
      kgAtSale: 1000,
      realisedBdt: 50_000,
      chargedBdt: 400_000,
      investorsPercent: 60,
      units: 10,
      saleLowBdtPerKg: 400,
      saleHighBdtPerKg: 500,
      deathsPercent: 10,
    });
    expect(projected.low.proceedsBdt).toBe(410_000);
  });
});
