import { describe, expect, it } from "vitest";

import {
  SETTLING_IN_DAYS,
  findExpectedGainProblems,
  gainCountsFrom,
  gainOnRationOf,
  gainStandingOf,
  isShortOfExpected,
} from "./expected-gain";
import { startOfFarmDay } from "./farm-clock";
import { PLAUSIBLE_DAILY_GAIN_KG, addDays } from "./fattening";

// A bull gaining under what his Ration is written to put on him is somebody's reason to go and look at him, so the
// ways this could send somebody to the wrong bull are pinned: a rate read off two weighings a gut-fill apart, a rate
// that counts the days he was still getting over the lorry, and a rate from the Ration he ate before.

const at = (day: string) => new Date(`${day}T06:00:00+06:00`);
const reading = (day: string, weightKg: number) => ({
  weightKg,
  weighedAt: at(day),
});

describe("an Expected Gain as typed", () => {
  it("takes a range, and one whose ends are the same", () => {
    expect(findExpectedGainProblems({ lowKg: 0.6, highKg: 0.9 })).toEqual([]);
    expect(findExpectedGainProblems({ lowKg: 0.8, highKg: 0.8 })).toEqual([]);
  });

  it("refuses a gain of nothing, one no bull makes, and a low above its high", () => {
    expect(findExpectedGainProblems({ lowKg: 0, highKg: 0.9 })).toEqual([
      "expectedGain.lowKg: a gain above nothing",
    ]);
    expect(
      findExpectedGainProblems({
        lowKg: 0.6,
        highKg: PLAUSIBLE_DAILY_GAIN_KG + 0.1,
      })
    ).toHaveLength(1);
    expect(findExpectedGainProblems({ lowKg: 0.9, highKg: 0.6 })).toEqual([
      "expectedGain: Low must not be above High",
    ]);
    expect(
      findExpectedGainProblems({ lowKg: Number.NaN, highKg: 0.9 })
    ).toHaveLength(1);
  });
});

describe("when a bull's gain on his Ration counts from", () => {
  const arrivedAt = at("2027-03-01");

  it("waits for a bought bull to settle in after he came, counted in the farm's days", () => {
    expect(gainCountsFrom({ arrivedAt, onRationSince: arrivedAt })).toEqual(
      startOfFarmDay(addDays("2027-03-01", SETTLING_IN_DAYS))
    );
    // Came at ten at night; weighed at seven in the morning three weeks on. He has settled in.
    const lateArrival = new Date("2027-03-01T22:00:00+06:00");
    const weighed = new Date(
      `${addDays("2027-03-01", SETTLING_IN_DAYS)}T07:00:00+06:00`
    );
    expect(
      gainCountsFrom({ arrivedAt: lateArrival, onRationSince: lateArrival }) <=
        weighed
    ).toBe(true);
  });

  it("starts the day he came onto this Ration, when that was later", () => {
    // Moved in the afternoon: that morning's reading is what he weighed when he started on it.
    const moved = new Date("2027-04-10T15:00:00+06:00");
    expect(gainCountsFrom({ arrivedAt, onRationSince: moved })).toEqual(
      startOfFarmDay("2027-04-10")
    );
  });

  it("has no settling in for an animal nobody trucked here", () => {
    const moved = at("2027-04-10");
    expect(gainCountsFrom({ arrivedAt: null, onRationSince: moved })).toEqual(
      startOfFarmDay("2027-04-10")
    );
  });
});

describe("a bull's gain on his Ration", () => {
  const countsFrom = at("2027-03-01");

  it("runs from his latest reading back to the latest one four weeks before it", () => {
    const gain = gainOnRationOf(
      [
        reading("2027-03-01", 200),
        reading("2027-03-15", 212),
        reading("2027-03-29", 221),
        reading("2027-04-12", 236),
      ],
      { readDays: 28, countsFrom }
    );
    // 15 March to 12 April: 24 kg in 28 days. Not 1 March, which is further back than it need be.
    expect(gain).toEqual({
      dailyGainKg: 0.86,
      overDays: 28,
      from: reading("2027-03-15", 212),
      to: reading("2027-04-12", 236),
    });
  });

  it("passes over a reading a gut-fill away rather than read a rate off it", () => {
    // The last two are three days apart, and a bull full of water reads two kilos a day across them.
    const gain = gainOnRationOf(
      [
        reading("2027-03-01", 200),
        reading("2027-03-29", 220),
        reading("2027-04-01", 226),
      ],
      { readDays: 28, countsFrom }
    );
    expect(gain?.from).toEqual(reading("2027-03-01", 200));
    expect(gain?.overDays).toBe(31);
  });

  it("takes a reading four weeks of farm days back, whatever the hour", () => {
    // Weighed at eight one day and at seven four weeks later: still four weeks.
    const gain = gainOnRationOf(
      [
        { weightKg: 200, weighedAt: new Date("2027-03-01T08:00:00+06:00") },
        { weightKg: 221, weighedAt: new Date("2027-03-29T07:00:00+06:00") },
      ],
      { readDays: 28, countsFrom }
    );
    expect(gain).toMatchObject({ dailyGainKg: 0.75, overDays: 28 });
  });

  it("says nothing while no reading is far enough back", () => {
    expect(
      gainOnRationOf([reading("2027-03-01", 200), reading("2027-03-15", 210)], {
        readDays: 28,
        countsFrom,
      })
    ).toBe(null);
    expect(gainOnRationOf([], { readDays: 28, countsFrom })).toBe(null);
  });

  it("never counts from a reading before he settled in or came onto the Ration", () => {
    // Weighed on the day he came, off the lorry: that reading is not his Ration's to answer for.
    const gain = gainOnRationOf(
      [reading("2027-02-20", 230), reading("2027-03-20", 222)],
      { readDays: 28, countsFrom }
    );
    expect(gain).toBe(null);
  });

  it("reads a bull going backwards as a loss", () => {
    const gain = gainOnRationOf(
      [reading("2027-03-01", 250), reading("2027-03-29", 243)],
      { readDays: 28, countsFrom }
    );
    expect(gain?.dailyGainKg).toBe(-0.25);
  });
});

describe("a gain against the Ration's Expected Gain", () => {
  const expected = { lowKg: 0.6, highKg: 0.9 };

  it("names each standing", () => {
    expect(gainStandingOf(-0.1, expected)).toBe("losing");
    expect(gainStandingOf(0, expected)).toBe("under");
    expect(gainStandingOf(0.59, expected)).toBe("under");
    expect(gainStandingOf(0.6, expected)).toBe("within");
    expect(gainStandingOf(0.9, expected)).toBe("within");
    expect(gainStandingOf(0.91, expected)).toBe("over");
  });

  it("tells the farm of the losing and the under, and of nobody else", () => {
    expect(isShortOfExpected("losing")).toBe(true);
    expect(isShortOfExpected("under")).toBe(true);
    expect(isShortOfExpected("within")).toBe(false);
    expect(isShortOfExpected("over")).toBe(false);
  });
});
