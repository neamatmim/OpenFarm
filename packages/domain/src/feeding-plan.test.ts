import { describe, expect, it } from "vitest";

import { farmDaysApart } from "./farm-clock";
import { addDays } from "./fattening";
import type { FeedingPlan, PlannedRation } from "./feeding-plan";
import {
  feedingPlanProblems,
  forecastFeedingPlan,
  plannedQuantity,
} from "./feeding-plan";

const stage = (
  id: string,
  fromKg: number | null,
  toKg: number | null,
  per100 = 2
): PlannedRation => ({
  rationId: id,
  versionId: `${id}-v1`,
  nameBn: id,
  nameEn: null,
  band: { fromKg, toKg },
  gain: { lowKg: 0.5, highKg: 1 },
  items: [
    { feedItemId: "grass", kgPer100KgPerDay: per100 },
    { feedItemId: "salt", kgPerAnimalPerDay: 0.03 },
  ],
});
const plan = (overrides: Partial<FeedingPlan> = {}): FeedingPlan => ({
  startDay: "2028-01-01",
  startWeightKg: 150,
  saleDay: "2028-10-01",
  targetWeightKg: 350,
  adaptationDays: 0,
  transitionDays: 0,
  reviewDays: 28,
  reservePercent: 10,
  arrival: null,
  stages: [stage("grower", 100, 250), stage("finisher", 250, null, 3)],
  ...overrides,
});
const feed = (forecast: ReturnType<typeof forecastFeedingPlan>, id: string) =>
  forecast.feeds.find((one) => one.feedItemId === id)?.quantity ?? 0;

describe("purchase-to-sale feeding forecast", () => {
  it("grows a 150 kg animal daily over nine actual calendar months, crossing ration bands", () => {
    const result = forecastFeedingPlan(plan(), "expected");
    const days = farmDaysApart("2028-01-01", "2028-10-01");
    expect(result.endWeightKg).toBe(355.5);
    expect(result.months).toHaveLength(9);
    expect(result.months.reduce((sum, month) => sum + month.days, 0)).toBe(
      days
    );
    expect(result.months[1]?.days).toBe(29);
    expect(result.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rationId: "finisher", day: "2028-05-14" }),
      ])
    );
    expect(feed(result, "grass")).toBeGreaterThan(150 * 0.02 * days);
    expect(feed(result, "salt")).toBeCloseTo(0.03 * days, 6);
    for (const id of ["grass", "salt"]) {
      expect(
        result.months.reduce(
          (sum, month) =>
            sum +
            (month.feeds.find((one) => one.feedItemId === id)?.quantity ?? 0),
          0
        )
      ).toBeCloseTo(feed(result, id), 6);
    }
  });
  it("uses actual weight to update future feed without charging historical days again", () => {
    const current = forecastFeedingPlan(plan(), "expected", {
      day: "2028-02-01",
      weightKg: 180,
      includeFrom: "2028-02-15",
    });
    expect(current.months[0]).toMatchObject({
      month: "2028-02",
      days: 15,
      fromKg: 190.5,
    });
    expect(current.months.some((month) => month.month === "2028-01")).toBe(
      false
    );
    expect(current.endWeightKg).toBe(362.3);
    const sold = forecastFeedingPlan(plan(), "expected", {
      day: "2028-10-01",
      weightKg: 340,
      includeFrom: "2028-10-01",
    });
    expect(sold.endWeightKg).toBe(340);
    expect(sold.feeds).toEqual([]);
  });
  it("feeds the arrival ration without assuming gain during adaptation", () => {
    const arrival = { ...stage("arrival", null, null, 1), gain: null };
    const result = forecastFeedingPlan(
      plan({ saleDay: "2028-01-25", adaptationDays: 21, arrival }),
      "expected"
    );
    expect(result.endWeightKg).toBe(152.3);
    expect(result.reviews[1]).toMatchObject({
      day: "2028-01-22",
      weightKg: 150,
      rationId: "grower",
    });
    expect(feed(result, "grass")).toBeCloseTo(21 * 1.5 + 3 + 3.015 + 3.03, 6);
  });
  it("blends both feed and gains gradually at a stage change", () => {
    const first = stage("first", 100, 151, 1);
    const next = stage("next", 151, null, 3);
    const result = forecastFeedingPlan(
      plan({ saleDay: "2028-01-05", stages: [first, next], transitionDays: 2 }),
      "fast"
    );
    // 150*1% + 151*2% + 152*3% + 153*3%; equal gains in both stages.
    expect(feed(result, "grass")).toBeCloseTo(1.5 + 3.02 + 4.56 + 4.59, 6);
    expect(result.endWeightKg).toBe(154);
  });
  it("preserves an in-progress transition when a weigh-in anchors the forecast", () => {
    const options = plan({
      stages: [stage("first", 100, 151, 1), stage("next", 151, null, 3)],
      transitionDays: 4,
      saleDay: "2028-01-06",
    });
    const full = forecastFeedingPlan(options, "fast");
    const anchored = forecastFeedingPlan(options, "fast", {
      day: "2028-01-03",
      weightKg: 152,
    });
    expect(full.endWeightKg).toBe(anchored.endWeightKg);
    expect(feed(anchored, "grass")).toBeCloseTo(
      feed(full, "grass") - 1.5 - 151 * 0.015,
      6
    );
  });
  it("does not extrapolate across missing or ambiguous ration bands", () => {
    const gap = forecastFeedingPlan(
      plan({ stages: [stage("first", 100, 151)] }),
      "fast"
    );
    expect(gap.stopped).toEqual({
      day: "2028-01-02",
      weightKg: 151,
      reason: "gap",
    });
    expect(gap.endWeightKg).toBeNull();
    expect(gap.months[0]?.days).toBe(1);
    const overlap = forecastFeedingPlan(
      plan({ stages: [stage("one", 100, 200), stage("two", 150, 300)] }),
      "expected"
    );
    expect(overlap.stopped?.reason).toBe("overlap");
    expect(overlap.feeds).toEqual([]);
  });
  it("runs scenarios independently because stage timing changes feed demand", () => {
    const p = plan();
    const slow = forecastFeedingPlan(p, "slow");
    const fast = forecastFeedingPlan(p, "fast");
    expect(slow.endWeightKg).toBe(287);
    expect(fast.endWeightKg).toBe(424);
    expect(feed(fast, "grass")).toBeGreaterThan(feed(slow, "grass"));
    expect(slow.reviews[1]?.day).not.toBe(fast.reviews[1]?.day);
  });
  it("keeps original inputs immutable and refuses invalid planning ladders", () => {
    const original = plan();
    const copy = structuredClone(original);
    forecastFeedingPlan(original, "fast");
    expect(original).toEqual(copy);
    expect(feedingPlanProblems(plan({ adaptationDays: 21 }))).toContain(
      "arrival"
    );
    expect(
      feedingPlanProblems(
        plan({
          stages: [stage("first", null, 300), stage("second", 200, null)],
        })
      )
    ).toContain("overlap");
    expect(
      feedingPlanProblems(
        plan({
          stages: [stage("first", 100, 151), stage("second", 151.1, null)],
        })
      )
    ).toContain("gap");
    expect(
      feedingPlanProblems(plan({ saleDay: addDays("2028-01-01", 541) }))
    ).toContain("duration");
  });
  it("rounds purchasing quantities up, keeping minerals and counted units", () => {
    expect(plannedQuantity(0.031, "kg")).toBe(0.04);
    expect(plannedQuantity(1.01, "bundle")).toBe(2);
    expect(plannedQuantity(1.2, "liter")).toBe(1.2);
    expect(plannedQuantity(0, "kg")).toBe(0);
  });
});
