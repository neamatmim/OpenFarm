import { describe, expect, it } from "vitest";

import { HEIFER_SERVICE, heiferGrowthOf } from "./heifer-growth";

const DAY_MS = 24 * 60 * 60 * 1000;
const BORN = new Date("2026-01-01T06:00:00.000Z");
const dayOf = (age: number) => new Date(BORN.getTime() + age * DAY_MS);
const weighed = (age: number, weightKg: number) => ({
  weightKg,
  weighedAt: dayOf(age),
});

describe("how a heifer is growing toward her first service", () => {
  it("carries the gain she has kept up since her first weighing on to the age she is due to be served", () => {
    const growth = heiferGrowthOf(
      {
        bornAt: BORN,
        deshi: false,
        weights: [weighed(0, 30), weighed(300, 150)],
      },
      dayOf(310)
    );
    // 120 kg over 300 days is 0.4 kg a day; 248 days more to 548 days old is 99.2 kg more.
    expect(growth).toMatchObject({
      ageDays: 310,
      latest: { weightKg: 150 },
      gainPerDay: 0.4,
      atServiceAgeKg: 249,
      aim: HEIFER_SERVICE.cross,
      reached: false,
      behind: true,
    });
  });

  it("is on track when that gain reaches the weight by the age", () => {
    const growth = heiferGrowthOf(
      {
        bornAt: BORN,
        deshi: false,
        weights: [weighed(0, 30), weighed(300, 180)],
      },
      dayOf(300)
    );
    expect(growth).toMatchObject({ gainPerDay: 0.5, behind: false });
  });

  it("reads a deshi heifer against her own, later age", () => {
    const growth = heiferGrowthOf(
      {
        bornAt: BORN,
        deshi: true,
        weights: [weighed(0, 15), weighed(300, 105)],
      },
      dayOf(300)
    );
    // 0.3 kg a day, 613 days more to 913: 105 + 183.9.
    expect(growth).toMatchObject({
      aim: HEIFER_SERVICE.deshi,
      atServiceAgeKg: 289,
      behind: false,
    });
  });

  it("is ready by weight once she has reached it, whatever her age", () => {
    const growth = heiferGrowthOf(
      {
        bornAt: BORN,
        deshi: false,
        weights: [weighed(0, 30), weighed(400, 260)],
      },
      dayOf(400)
    );
    expect(growth).toMatchObject({ reached: true, behind: false });
  });

  it("is behind once past the age and still short, by what she last weighed", () => {
    const growth = heiferGrowthOf(
      {
        bornAt: BORN,
        deshi: false,
        weights: [weighed(0, 30), weighed(600, 220)],
      },
      dayOf(610)
    );
    expect(growth).toMatchObject({ atServiceAgeKg: 220, behind: true });
  });

  it("says no gain from weighings too close together, nor from one, and nothing ahead without a birth date", () => {
    expect(
      heiferGrowthOf(
        {
          bornAt: BORN,
          deshi: false,
          weights: [weighed(290, 140), weighed(300, 150)],
        },
        dayOf(300)
      )
    ).toMatchObject({ gainPerDay: null, atServiceAgeKg: null, behind: false });
    expect(
      heiferGrowthOf(
        { bornAt: BORN, deshi: false, weights: [weighed(0, 30)] },
        dayOf(5)
      )
    ).toMatchObject({ gainPerDay: null, latest: { weightKg: 30 } });
    expect(
      heiferGrowthOf(
        {
          bornAt: null,
          deshi: false,
          weights: [weighed(0, 30), weighed(300, 150)],
        },
        dayOf(300)
      )
    ).toMatchObject({
      ageDays: null,
      gainPerDay: 0.4,
      atServiceAgeKg: null,
      behind: false,
    });
  });

  it("reads the readings in the order they were taken, whatever order they come in", () => {
    const growth = heiferGrowthOf(
      {
        bornAt: BORN,
        deshi: false,
        weights: [weighed(300, 150), weighed(0, 30)],
      },
      dayOf(300)
    );
    expect(growth).toMatchObject({
      latest: { weightKg: 150 },
      gainPerDay: 0.4,
    });
  });
});
