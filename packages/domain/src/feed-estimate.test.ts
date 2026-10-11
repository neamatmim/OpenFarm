import { describe, expect, it } from "vitest";

import {
  feedEstimateOf,
  feedEstimateTotals,
  feedMonthDays,
  rationDemandOf,
} from "./feed-estimate";
import type { FeedEstimatePen } from "./feed-estimate";
import type { FeedUnit } from "./feed-units";

const units = new Map<string, FeedUnit>([
  ["grass", "kg"],
  ["salt", "kg"],
  ["molasses", "liter"],
  ["bundles", "bundle"],
]);
const weighed = (weightKg: number | null) => ({ weightKg, weighedAt: null });
const stock = {
  perDay: 100,
  days: 30,
  onHand: 500,
  expiredLeft: 0,
  unit: "kg" as const,
  priceMoney: 30,
};

describe("calendar months for feed planning", () => {
  it("counts ordinary months, leap February and century leap rules", () => {
    expect(feedMonthDays("2026-04")).toBe(30);
    expect(feedMonthDays("2026-01")).toBe(31);
    expect(feedMonthDays("2026-02")).toBe(28);
    expect(feedMonthDays("2028-02")).toBe(29);
    expect(feedMonthDays("2100-02")).toBe(28);
    expect(feedMonthDays("2000-02")).toBe(29);
  });
  it("refuses invalid month formats rather than rolling them into another month", () => {
    expect(() => feedMonthDays("2026-13")).toThrow("YYYY-MM");
    expect(() => feedMonthDays("2026-2")).toThrow("YYYY-MM");
  });
});

describe("daily demand from today's rations", () => {
  it("adds feed across pens, with head and body-weight lines and average weights", () => {
    const pens: FeedEstimatePen[] = [
      {
        animals: [weighed(200), weighed(300), weighed(null)],
        ration: [
          { feedItemId: "grass", kgPer100KgPerDay: 3 },
          { feedItemId: "salt", kgPerAnimalPerDay: 0.03 },
        ],
      },
      {
        animals: [weighed(400)],
        ration: [
          { feedItemId: "grass", kgPer100KgPerDay: 3 },
          { feedItemId: "salt", kgPerAnimalPerDay: 0.03 },
        ],
      },
    ];
    const demand = rationDemandOf(pens, units);
    expect(demand.perDay.get("grass")).toBe(34.5);
    expect(demand.perDay.get("salt")).toBe(0.12);
    expect(demand.estimatedWeights).toBe(1);
    expect(demand.animalsWithoutRation).toBe(0);
  });
  it("keeps demand unknown when even one contributing pen has no usable weights", () => {
    const ration = [
      { feedItemId: "grass", kgPer100KgPerDay: 3 },
      { feedItemId: "salt", kgPerAnimalPerDay: 0.03 },
    ];
    for (const pens of [
      [
        { animals: [weighed(200)], ration },
        { animals: [weighed(null)], ration },
      ],
      [
        { animals: [weighed(null)], ration },
        { animals: [weighed(200)], ration },
      ],
    ]) {
      const demand = rationDemandOf(pens, units);
      expect(demand.perDay.get("grass")).toBeNull();
      expect(demand.perDay.get("salt")).toBe(0.06);
    }
  });
  it("does not invent demand for empty pens or silently include animals without rations", () => {
    const demand = rationDemandOf(
      [
        { animals: [], ration: [{ feedItemId: "grass", kgPer100KgPerDay: 3 }] },
        { animals: [weighed(200), weighed(null)], ration: null },
        { animals: [weighed(300)], ration: [] },
      ],
      units
    );
    expect(demand.perDay.size).toBe(0);
    expect(demand.animalsWithoutRation).toBe(3);
  });
  it("preserves liters and whole bundles instead of adding different units together", () => {
    const demand = rationDemandOf(
      [
        {
          animals: [weighed(200), weighed(300), weighed(null)],
          ration: [
            { feedItemId: "molasses", kgPerAnimalPerDay: 0.5 },
            { feedItemId: "bundles", kgPerAnimalPerDay: 2.5 },
          ],
        },
      ],
      units
    );
    expect(demand.perDay.get("molasses")).toBe(1.5);
    expect(demand.perDay.get("bundles")).toBe(8);
  });
});

describe("a month's quantities and estimated costs", () => {
  it("subtracts stock from demand and values the full month and the shortfall separately", () => {
    expect(feedEstimateOf(stock)).toEqual({
      perDay: 100,
      available: 500,
      required: 3000,
      toBuy: 2500,
      priceMoney: 30,
      requiredMoney: 90_000,
      toBuyMoney: 75_000,
    });
  });
  it("excludes expired feed and ignores negative book stock when deciding what to buy", () => {
    expect(feedEstimateOf({ ...stock, expiredLeft: 200 })).toMatchObject({
      available: 300,
      toBuy: 2700,
    });
    expect(feedEstimateOf({ ...stock, onHand: -200 })).toMatchObject({
      available: 0,
      toBuy: 3000,
    });
    expect(feedEstimateOf({ ...stock, expiredLeft: 800 })).toMatchObject({
      available: 0,
      toBuy: 3000,
    });
  });
  it("never asks to buy a negative amount, and a covered item needs no price for its buying cost", () => {
    expect(
      feedEstimateOf({ ...stock, onHand: 4000, priceMoney: null })
    ).toMatchObject({ toBuy: 0, toBuyMoney: 0, requiredMoney: null });
  });
  it("distinguishes unknown demand, unpriced feed, unused feed, and a real zero price", () => {
    expect(feedEstimateOf({ ...stock, perDay: null })).toMatchObject({
      required: null,
      toBuy: null,
      requiredMoney: null,
      toBuyMoney: null,
    });
    expect(feedEstimateOf({ ...stock, priceMoney: null })).toMatchObject({
      required: 3000,
      requiredMoney: null,
      toBuyMoney: null,
    });
    expect(
      feedEstimateOf({ ...stock, perDay: 0, priceMoney: null })
    ).toMatchObject({ required: 0, requiredMoney: 0, toBuyMoney: 0 });
    expect(feedEstimateOf({ ...stock, priceMoney: 0 })).toMatchObject({
      requiredMoney: 0,
      toBuyMoney: 0,
    });
  });
  it("retains small feed quantities and computes from the unrounded recent daily average", () => {
    expect(feedEstimateOf({ ...stock, perDay: 0.03, onHand: 0 })).toMatchObject(
      { required: 0.9, toBuy: 0.9 }
    );
    expect(
      feedEstimateOf({ ...stock, perDay: 100 / 14, onHand: 0 })
    ).toMatchObject({ required: 214.3 });
  });
  it("reports known costs and missing figures separately", () => {
    const lines = [
      feedEstimateOf(stock),
      feedEstimateOf({ ...stock, priceMoney: null }),
      feedEstimateOf({ ...stock, perDay: null }),
      feedEstimateOf({ ...stock, perDay: 0, priceMoney: null }),
    ];
    expect(feedEstimateTotals(lines)).toEqual({
      requiredMoney: 90_000,
      toBuyMoney: 75_000,
      itemsToBuy: 2,
      unknownDemand: 1,
      unpriced: 1,
    });
  });
});
