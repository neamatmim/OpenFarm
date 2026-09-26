import { describe, expect, it } from "vitest";

import { farmDaysApart } from "./farm-clock";
import {
  bandOf,
  baselineOf,
  buyingAgainstPlan,
  planAverages,
  planTotals,
  plannedHeadKg,
  plannedResult,
  stillToBuyOf,
} from "./venture-plan";

const LINES = [
  // Eight bulls of 200 to 250 kg at ৳480 a kilo, putting on 0.9 kg a day.
  { animals: 8, fromKg: 200, toKg: 250, buyBdtPerKg: 480, dailyGainKg: 0.9 },
  // Four of 250 to 300 kg at ৳470, putting on 0.8 kg a day.
  { animals: 4, fromKg: 250, toKg: 300, buyBdtPerKg: 470, dailyGainKg: 0.8 },
];

describe("what a Venture Plan comes to", () => {
  it("buys each line at the middle of its band, and grows it to the window at its own gain", () => {
    // 8 × 225 kg = 1,800 kg at ৳480 is ৳8,64,000; 4 × 275 kg = 1,100 kg at ৳470 is ৳5,17,000. Over 100 days the
    // first line reaches 225 + 90 = 315 kg a head, the second 275 + 80 = 355 kg.
    const totals = planTotals({
      lines: LINES,
      cattleBudgetBdt: 1_400_000,
      daysOnFeed: 100,
    });
    expect(totals.lines).toEqual([
      { boughtKg: 1800, costBdt: 864_000, saleKgEach: 315, saleKg: 2520 },
      { boughtKg: 1100, costBdt: 517_000, saleKgEach: 355, saleKg: 1420 },
    ]);
    expect(totals).toMatchObject({
      animals: 12,
      boughtKg: 2900,
      costBdt: 1_381_000,
      saleKg: 3940,
      overBudgetBdt: 0,
    });
  });

  it("says by how much it spends past the cattle budget, without refusing it", () => {
    const totals = planTotals({
      lines: LINES,
      cattleBudgetBdt: 1_300_000,
      daysOnFeed: 100,
    });
    expect(totals.overBudgetBdt).toBe(81_000);
  });
});

describe("the band an animal was bought in", () => {
  it("is the line whose weights she came in at, the lower weight in and the upper out", () => {
    expect(bandOf(LINES, 200)).toBe(0);
    expect(bandOf(LINES, 249.9)).toBe(0);
    expect(bandOf(LINES, 250)).toBe(1);
  });

  it("is none for one lighter or heavier than every line", () => {
    expect(bandOf(LINES, 180)).toBeNull();
    expect(bandOf(LINES, 300)).toBeNull();
  });
});

describe("the baseline a Venture is measured against", () => {
  it("is the last version saved while it was still gathering capital", () => {
    expect(
      baselineOf([
        { version: 1, madeWhile: "open" },
        { version: 2, madeWhile: "open" },
        { version: 3, madeWhile: "buying" },
      ])
    ).toBe(2);
  });

  it("is the first there is, for a plan first made after buying began", () => {
    expect(
      baselineOf([
        { version: 1, madeWhile: "fattening" },
        { version: 2, madeWhile: "selling" },
      ])
    ).toBe(1);
    expect(baselineOf([])).toBeNull();
  });
});

describe("what was bought against the plan", () => {
  it("counts each animal in the band she was bought in, and any outside every band apart", () => {
    // Bought: 210 kg for ৳1,00,800 and 240 kg for ৳1,15,200 (৳480 a kilo, both in the first band), 260 kg for ৳1,22,200
    // (the second band), and a 320 kg bull for ৳1,50,000 that no band planned.
    const bought = buyingAgainstPlan(LINES, [
      { weightKg: 210, priceBdt: 100_800 },
      { weightKg: 240, priceBdt: 115_200 },
      { weightKg: 260, priceBdt: 122_200 },
      { weightKg: 320, priceBdt: 150_000 },
    ]);
    expect(bought.bands[0]).toEqual({
      planned: { animals: 8, kg: 1800, costBdt: 864_000, bdtPerKg: 480 },
      bought: { animals: 2, kg: 450, costBdt: 216_000, bdtPerKg: 480 },
    });
    expect(bought.bands[1]?.bought).toEqual({
      animals: 1,
      kg: 260,
      costBdt: 122_200,
      bdtPerKg: 470,
    });
    expect(bought.outside).toEqual({
      animals: 1,
      kg: 320,
      costBdt: 150_000,
      bdtPerKg: 468.75,
    });
    expect(bought.total).toMatchObject({ animals: 4, costBdt: 488_200 });
  });

  it("says no price a kilo for a band nothing was bought in", () => {
    const bought = buyingAgainstPlan(LINES, []);
    expect(bought.bands[0]?.bought).toEqual({
      animals: 0,
      kg: 0,
      costBdt: 0,
      bdtPerKg: null,
    });
  });
});

describe("what the plan says a head weighs by a day", () => {
  it("grows each band from its middle at its own gain, and weighs the herd by its animals", () => {
    // Fifty days on: the first band's 8 at 225 + 45 = 270 kg, the second's 4 at 275 + 40 = 315 kg — 285 kg a head.
    expect(plannedHeadKg(LINES, 50)).toBe(285);
    // Nothing before they are bought.
    expect(plannedHeadKg(LINES, -5)).toBe(241.7);
  });
});

describe("what the plan says the Venture makes", () => {
  it("sells the herd's weight at both prices, less the cattle it buys and the whole running budget", () => {
    // 3,940 kg at ৳520 is ৳20,48,800 and at ৳600 ৳23,64,000; less ৳13,81,000 of cattle and ৳4,00,000 of running.
    expect(
      plannedResult({
        saleKg: 3940,
        cattleBdt: 1_381_000,
        runningBudgetBdt: 400_000,
        saleLowBdtPerKg: 520,
        saleHighBdtPerKg: 600,
      })
    ).toEqual({ lowBdt: 267_800, highBdt: 583_000 });
  });

  it("sells fewer at the low end by the share the plan expects to die", () => {
    // Five per cent of 3,940 kg does not live to be sold: 3,743 kg at ৳520 is ৳19,46,360, less the same ৳17,81,000.
    expect(
      plannedResult({
        saleKg: 3940,
        cattleBdt: 1_381_000,
        runningBudgetBdt: 400_000,
        saleLowBdtPerKg: 520,
        saleHighBdtPerKg: 600,
        deathsPercent: 5,
      })
    ).toEqual({ lowBdt: 165_360, highBdt: 583_000 });
  });
});

describe("a plan's buying as one average", () => {
  it("weighs the price by kilos, and the weight and gain by head", () => {
    // 8 × 225 kg = 1,800 kg at ৳480 and 4 × 275 kg = 1,100 kg at ৳470: ৳13,81,000 for 2,900 kg is ৳476.21 a kilo;
    // 2,900 kg over 12 head is 241.7 kg; 8 × 0.9 + 4 × 0.8 = 10.4 kg a day over 12 is 0.87.
    expect(planAverages(LINES)).toEqual({
      buyBdtPerKg: 476.21,
      buyWeightKg: 241.7,
      dailyGainKg: 0.87,
    });
    expect(planAverages([])).toEqual({
      buyBdtPerKg: null,
      buyWeightKg: null,
      dailyGainKg: null,
    });
  });
});

describe("what a plan has still to buy", () => {
  it("is each band less what was bought in it, grown to the window and paid for at the band's price", () => {
    // Two of the first band bought, and one past every band that fills nothing. Left: six at 225 kg and four at 275,
    // fed 50 days — 6 × 270 + 4 × 315 = 2,880 kg — costing 6 × 225 × ৳480 + 4 × 275 × ৳470 = ৳6,48,000 + ৳5,17,000.
    expect(
      stillToBuyOf({
        lines: LINES,
        bought: [
          { weightKg: 210, priceBdt: 100_800 },
          { weightKg: 240, priceBdt: 115_200 },
          { weightKg: 320, priceBdt: 150_000 },
        ],
        days: 50,
      })
    ).toEqual({ kg: 2880, costBdt: 1_165_000 });
  });

  it("never goes below nothing in a band bought past its plan", () => {
    const over = Array.from({ length: 10 }, () => ({
      weightKg: 230,
      priceBdt: 110_000,
    }));
    expect(
      stillToBuyOf({ lines: LINES.slice(0, 1), bought: over, days: 50 })
    ).toEqual({ kg: 0, costBdt: 0 });
  });
});

describe("the farm days between two days", () => {
  it("counts whole days, and backwards as fewer than none", () => {
    expect(farmDaysApart("2052-01-03", "2052-04-01")).toBe(89);
    expect(farmDaysApart("2052-04-01", "2052-01-03")).toBe(-89);
  });
});
