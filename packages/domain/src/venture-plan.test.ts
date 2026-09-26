import { describe, expect, it } from "vitest";

import { baselineOf, bandOf, planTotals } from "./venture-plan";

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
