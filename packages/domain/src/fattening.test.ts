import { describe, expect, it } from "vitest";

import {
  addDays,
  daysOnFeedOf,
  fatteningView,
  implausibleChange,
  PLAUSIBLE_DAILY_GAIN_KG,
  PLAUSIBLE_DAILY_LOSS_KG,
} from "./fattening";

// An animal bought today is fed towards a date and a weight, and both of those answers are arithmetic
// nobody can check by looking at her. The two that would be silent if they were wrong are pinned hardest:
// a projection taken from the unrounded rate, and a bull who has stopped gaining being read as stopped.

const at = (day: string) => new Date(`${day}T06:00:00+06:00`);

describe("a calendar day plus days", () => {
  it("crosses a month, a year and a leap day", () => {
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
  });

  it("counts backwards too", () => {
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
});

describe("a reading the farm should query before accepting", () => {
  const last = { weightKg: 300, weighedAt: at("2027-03-01") };
  const after = (days: number, weightKg: number) => ({
    weightKg,
    weighedAt: at(addDays("2027-03-01", days)),
  });

  it("has nothing to say about her first time on the scale", () => {
    expect(implausibleChange(null, after(10, 900))).toBe(null);
  });

  it("will not quote a rate off two weighings on one morning", () => {
    // They differ by what the animal drank.
    expect(
      implausibleChange(last, {
        weightKg: 340,
        weighedAt: new Date(at("2027-03-01").getTime() + 6 * 60 * 60 * 1000),
      })
    ).toBe(null);
  });

  it("queries a gain no bull makes, and says what it read", () => {
    expect(implausibleChange(last, after(10, 330))).toEqual({
      dailyKg: 3,
      days: 10,
      lastKg: 300,
    });
  });

  it("accepts a rate exactly at the limit, either way", () => {
    // The limit is what cattle do; past it is a scale or a tag read wrong.
    expect(
      implausibleChange(last, after(10, 300 + PLAUSIBLE_DAILY_GAIN_KG * 10))
    ).toBe(null);
    expect(
      implausibleChange(last, after(10, 300 - PLAUSIBLE_DAILY_LOSS_KG * 10))
    ).toBe(null);
  });

  it("gives loss more room than gain, because a sick animal drops fast", () => {
    // 2.9 a day is a query going up and unremarkable coming down. The farm would rather be told she is
    // losing than argued with.
    expect(implausibleChange(last, after(10, 329))).not.toBe(null);
    expect(implausibleChange(last, after(10, 271))).toBe(null);
  });
});

describe("how long she has been on feed", () => {
  it("counts from her Intake in whole days", () => {
    expect(daysOnFeedOf(at("2027-01-01"), at("2027-01-11"))).toBe(10);
  });

  it("never counts backwards for a lorry that has not arrived", () => {
    expect(daysOnFeedOf(at("2027-01-11"), at("2027-01-01"))).toBe(0);
  });
});

describe("what the scale means", () => {
  const intake = {
    weightKg: 250,
    arrivedAt: at("2027-01-01"),
    targetWeightKg: 400,
  };
  const windowOpensAt = at("2027-05-17");

  it("knows nothing of gain for a beast born here", () => {
    // She is on the Fattening side and being weighed, but there is no arrival weight to measure from.
    const view = fatteningView(
      null,
      [{ weightKg: 180, weighedAt: at("2027-04-01") }],
      windowOpensAt,
      at("2027-04-15")
    );
    expect(view.daysOnFeed).toBe(null);
    expect(view.sinceIntake).toBe(null);
    expect(view.recent).toBe(null);
    expect(view.onTrackFrom).toBe(null);
    expect(view.onTrack).toBe(null);
    expect(view.latestKg).toBe(180);
  });

  it("falls back to what she weighed off the lorry until she is on the scale", () => {
    const view = fatteningView(intake, [], windowOpensAt, at("2027-01-20"));
    expect(view.latestKg).toBe(250);
    expect(view.latestAt).toEqual(intake.arrivedAt);
    expect(view.sinceIntake).toBe(null);
  });

  it("reads one reading as a stay and not yet as a trend", () => {
    const view = fatteningView(
      intake,
      [{ weightKg: 371, weighedAt: at("2027-04-15") }],
      windowOpensAt,
      at("2027-04-15")
    );
    expect(view.recent).toBe(null);
    expect(view.onTrackFrom).toBe("sinceIntake");
  });

  it("judges a bull who has stopped by the fortnight, not by the season", () => {
    // Three good months and a flat fortnight: over her whole stay she makes her target, and over the
    // last two weeks she does not. The farm needs to hear the second.
    const view = fatteningView(
      intake,
      [
        { weightKg: 370, weighedAt: at("2027-04-01") },
        { weightKg: 371, weighedAt: at("2027-04-15") },
      ],
      windowOpensAt,
      at("2027-04-15")
    );
    expect(view.sinceIntake).toMatchObject({
      overDays: 104,
      projectedKg: 408.2,
      reachesTarget: true,
    });
    expect(view.recent).toMatchObject({
      overDays: 14,
      projectedKg: 373.3,
      reachesTarget: false,
    });
    expect(view.onTrack).toBe(false);
    expect(view.onTrackFrom).toBe("recent");
  });

  it("projects from the rate it measured, not from the rate it printed", () => {
    // Ten kilos in seven days is 1.4285… a day, shown as 1.43. Rounding first and multiplying by the
    // ninety days to the window turns a hundredth of a kilo into most of one: 438.7 instead of 438.6.
    const view = fatteningView(
      { weightKg: 300, arrivedAt: at("2027-01-01"), targetWeightKg: 400 },
      [{ weightKg: 310, weighedAt: at("2027-01-08") }],
      at("2027-04-08"),
      at("2027-01-08")
    );
    expect(view.sinceIntake?.dailyGainKg).toBe(1.43);
    expect(view.sinceIntake?.projectedKg).toBe(438.6);
  });

  it("has nothing to project once the window has opened", () => {
    const view = fatteningView(
      intake,
      [{ weightKg: 371, weighedAt: at("2027-05-20") }],
      windowOpensAt,
      at("2027-05-20")
    );
    expect(view.sinceIntake?.projectedKg).toBe(null);
    expect(view.sinceIntake?.reachesTarget).toBe(null);
    expect(view.onTrack).toBe(null);
  });
});
