import { describe, expect, it } from "vitest";

import { floorWeightOf, shrankPast, shrinkOf, shrinkOfMany } from "./shrink";

const at = (day: string) => new Date(`${day}T06:00:00.000Z`);

describe("shrink at sale", () => {
  it("is what she lost from her last weighing to the sale's scale", () => {
    expect(
      shrinkOf({
        lastKg: 320,
        lastAt: at("2026-09-20"),
        saleKg: 300,
        saleAt: at("2026-09-28"),
      })
    ).toEqual({ lastKg: 320, lostKg: 20, percent: 6.3, days: 8, stale: false });
  });

  it("says a weighing more than three weeks old is stale, and a gain is less than nothing", () => {
    expect(
      shrinkOf({
        lastKg: 300,
        lastAt: at("2026-09-01"),
        saleKg: 310,
        saleAt: at("2026-09-28"),
      })
    ).toMatchObject({ lostKg: -10, percent: -3.3, days: 27, stale: true });
  });

  it("is nothing without both weights", () => {
    expect(
      shrinkOf({
        lastKg: 0,
        lastAt: at("2026-09-20"),
        saleKg: 300,
        saleAt: at("2026-09-28"),
      })
    ).toBeNull();
  });

  it("is weighed by weight across an outing", () => {
    const one = shrinkOf({
      lastKg: 400,
      lastAt: at("2026-09-20"),
      saleKg: 380,
      saleAt: at("2026-09-28"),
    });
    const two = shrinkOf({
      lastKg: 200,
      lastAt: at("2026-09-20"),
      saleKg: 196,
      saleAt: at("2026-09-28"),
    });
    expect(shrinkOfMany([one, two, null])).toEqual({
      lostKg: 24,
      percent: 4,
      animals: 2,
    });
    expect(shrinkOfMany([null])).toBeNull();
  });
});

describe("the weight a sale is floored on", () => {
  const last = { weightKg: 400, at: at("2030-03-13") };

  it("is her last weighing less the allowance, where that is heavier than the day's", () => {
    expect(
      floorWeightOf({
        saleKg: 330,
        last,
        soldAt: at("2030-03-20"),
        allowPercent: 8,
      })
    ).toEqual({ weightKg: 368, from: "scale" });
  });

  it("is the day's weight where that is heavier, the weighing is stale, or there is none", () => {
    expect(
      floorWeightOf({
        saleKg: 380,
        last,
        soldAt: at("2030-03-20"),
        allowPercent: 8,
      })
    ).toEqual({ weightKg: 380, from: "day" });
    expect(
      floorWeightOf({
        saleKg: 330,
        last,
        soldAt: at("2030-04-12"),
        allowPercent: 8,
      })
    ).toEqual({ weightKg: 330, from: "day" });
    expect(
      floorWeightOf({
        saleKg: 330,
        last: null,
        soldAt: at("2030-03-20"),
        allowPercent: 8,
      })
    ).toEqual({ weightKg: 330, from: "day" });
  });
});

describe("shrink past the allowance", () => {
  const sold = (saleKg: number, saleDay = "2030-03-20") =>
    shrinkOf({
      lastKg: 400,
      lastAt: at("2030-03-13"),
      saleKg,
      saleAt: at(saleDay),
    });

  it("is over the allowance on a weighing still trusted", () => {
    expect(shrankPast(sold(352), 8)).toBe(true);
    expect(shrankPast(sold(380), 8)).toBe(false);
    expect(shrankPast(sold(352, "2030-04-12"), 8)).toBe(false);
    expect(shrankPast(null, 8)).toBe(false);
  });
});
