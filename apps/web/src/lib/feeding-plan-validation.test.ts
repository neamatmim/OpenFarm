import type { FeedingPlan, PlannedRation } from "@OpenFarm/domain/feeding-plan";
import { describe, expect, it } from "vitest";

import { feedingPlanIssue } from "./feeding-plan-validation";

const stage = (fromKg: number, toKg: number | null): PlannedRation => ({
  rationId: `ration-${fromKg}`,
  versionId: "version",
  nameBn: "রেশন",
  nameEn: null,
  band: { fromKg, toKg },
  gain: { lowKg: 0.5, highKg: 1 },
  items: [{ feedItemId: "grass", kgPerAnimalPerDay: 2 }],
});
const plan: FeedingPlan = {
  startDay: "2026-01-01",
  saleDay: "2026-10-01",
  startWeightKg: 150,
  targetWeightKg: 350,
  adaptationDays: 0,
  transitionDays: 7,
  reviewDays: 28,
  reservePercent: 10,
  arrival: null,
  stages: [stage(100, 250), stage(250, null)],
};
const typed = {
  startWeightKg: "150",
  targetWeightKg: "350",
  adaptationDays: "0",
  transitionDays: "7",
  reviewDays: "28",
  reservePercent: "10",
};
const today = "2026-01-01";

describe("feeding plan field guidance", () => {
  it("accepts a complete ladder and distinguishes missing adaptation ration, gaps and overlaps", () => {
    expect(feedingPlanIssue(plan, typed, today)).toBeNull();
    expect(
      feedingPlanIssue(
        { ...plan, adaptationDays: 10 },
        { ...typed, adaptationDays: "10" },
        today
      )
    ).toEqual({ at: "plan-arrival", message: "feedPlan.invalid.arrival" });
    expect(
      feedingPlanIssue(
        { ...plan, stages: [stage(100, 200), stage(250, null)] },
        typed,
        today
      )?.message
    ).toBe("feedPlan.invalid.gap");
    expect(
      feedingPlanIssue(
        { ...plan, stages: [stage(100, 300), stage(250, null)] },
        typed,
        today
      )?.message
    ).toBe("feedPlan.invalid.overlap");
  });
  it("identifies invalid dates and duration before trying to forecast", () => {
    expect(
      feedingPlanIssue({ ...plan, startDay: "2026-01-02" }, typed, today)?.at
    ).toBe("plan-start");
    expect(
      feedingPlanIssue({ ...plan, saleDay: "2026-02-31" }, typed, today)?.at
    ).toBe("plan-sale");
    expect(
      feedingPlanIssue({ ...plan, saleDay: "2026-01-01" }, typed, today)
        ?.message
    ).toBe("feedPlan.invalid.duration");
  });
  it("preserves the difference between a blank number and an allowed zero", () => {
    expect(
      feedingPlanIssue(plan, { ...typed, adaptationDays: "" }, today)?.at
    ).toBe("plan-adapt");
    expect(
      feedingPlanIssue(plan, { ...typed, reviewDays: "7.5" }, today)?.at
    ).toBe("plan-review");
    expect(
      feedingPlanIssue(plan, { ...typed, reservePercent: "51" }, today)?.at
    ).toBe("plan-reserve");
    expect(
      feedingPlanIssue(plan, { ...typed, startWeightKg: "Infinity" }, today)?.at
    ).toBe("plan-weight");
  });
});
