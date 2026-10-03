import { describe, expect, it } from "vitest";

import { againstLastBuys, lastBuysPerKg } from "./last-buys";

const now = new Date("2026-10-01T06:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("what the last buys cost a kilo", () => {
  it("is the farm's buys of the last two months near her weight, weighed by weight", () => {
    const buys = [
      { priceMoney: 100_000, weightKg: 250, arrivedAt: daysAgo(10) },
      { priceMoney: 120_000, weightKg: 270, arrivedAt: daysAgo(40) },
      // Too light, too heavy, and too long ago.
      { priceMoney: 60_000, weightKg: 150, arrivedAt: daysAgo(5) },
      { priceMoney: 200_000, weightKg: 400, arrivedAt: daysAgo(5) },
      { priceMoney: 50_000, weightKg: 260, arrivedAt: daysAgo(90) },
    ];
    expect(lastBuysPerKg(buys, { weightKg: 260, now })).toEqual({
      moneyPerKg: 423.08,
      animals: 2,
      days: 60,
    });
  });

  it("is nothing with no buy near her weight", () => {
    expect(
      lastBuysPerKg(
        [{ priceMoney: 60_000, weightKg: 150, arrivedAt: daysAgo(5) }],
        { weightKg: 260, now }
      )
    ).toBeNull();
  });

  it("says how far over or under, to a whole percent", () => {
    expect(againstLastBuys(460, 423.08)).toBe(9);
    expect(againstLastBuys(400, 423.08)).toBe(-5);
  });
});
