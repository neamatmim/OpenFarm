import { describe, expect, it } from "vitest";

import { projectedSettlement, unboughtKgAtWindow } from "./projection";
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

describe("the animals a budget has still to buy", () => {
  it("buys as many whole animals as the budget left will pay for, and grows each to the window", () => {
    // Ten lakh at ৳500 a kilo for 250 kg animals is ৳1,25,000 each: eight of them. A hundred days at 0.8 kg a day
    // puts 80 kg on each, so 330 kg apiece and 2,640 kg between them.
    expect(
      unboughtKgAtWindow({
        cattleBudgetLeftBdt: 1_000_000,
        buyBdtPerKg: 500,
        buyWeightKg: 250,
        dailyGainKg: 0.8,
        daysToWindow: 100,
      })
    ).toBe(2640);
  });

  it("buys none with a budget that will not pay for one, and grows nothing past the window", () => {
    expect(
      unboughtKgAtWindow({
        cattleBudgetLeftBdt: 100_000,
        buyBdtPerKg: 500,
        buyWeightKg: 250,
        dailyGainKg: 0.8,
        daysToWindow: 100,
      })
    ).toBe(0);
    // Bought on the window's first day: they are sold at what they were bought at.
    expect(
      unboughtKgAtWindow({
        cattleBudgetLeftBdt: 250_000,
        buyBdtPerKg: 500,
        buyWeightKg: 250,
        dailyGainKg: 0.8,
        daysToWindow: -3,
      })
    ).toBe(500);
  });
});
