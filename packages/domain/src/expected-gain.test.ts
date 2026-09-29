import { describe, expect, it } from "vitest";

import {
  SETTLING_IN_DAYS,
  FEWEST_FOR_A_FIGURE,
  expectedGainFor,
  farmGainFigureOf,
  findExpectedGainProblems,
  gainGroupOf,
  gainOverStayOf,
  grownWeightFor,
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

describe("the Expected Gain one animal is judged against", () => {
  const grower = { lowKg: 0.6, highKg: 0.9 };
  const shares = { deshiPercent: 70, femalePercent: 80 };

  it("is her Ration's for a crossbred bull", () => {
    expect(
      expectedGainFor(grower, { deshi: false, sex: "male" }, shares)
    ).toEqual({
      expectedGain: grower,
      adjustedFor: {
        deshiPercent: null,
        femalePercent: null,
        breedRecorded: true,
      },
    });
  });

  it("is cut to the deshi share for a deshi bull, both ends alike", () => {
    // 0.6 × 0.7 and 0.9 × 0.7.
    expect(
      expectedGainFor(grower, { deshi: true, sex: "male" }, shares)
    ).toMatchObject({
      expectedGain: { lowKg: 0.42, highKg: 0.63 },
      adjustedFor: { deshiPercent: 70, femalePercent: null },
    });
  });

  it("is cut to the female share for a cow, and to both for a deshi cow", () => {
    expect(
      expectedGainFor(grower, { deshi: false, sex: "female" }, shares)
        .expectedGain
    ).toEqual({ lowKg: 0.48, highKg: 0.72 });
    // 0.6 × 0.7 × 0.8 = 0.336, and 0.9 × 0.56 = 0.504.
    expect(
      expectedGainFor(grower, { deshi: true, sex: "female" }, shares)
        .expectedGain
    ).toEqual({ lowKg: 0.34, highKg: 0.5 });
  });

  it("judges an animal nobody wrote a breed for as a cross, and says so", () => {
    expect(
      expectedGainFor(grower, { deshi: null, sex: "male" }, shares)
    ).toEqual({
      expectedGain: grower,
      adjustedFor: {
        deshiPercent: null,
        femalePercent: null,
        breedRecorded: false,
      },
    });
  });

  it("follows the farm's own shares", () => {
    expect(
      expectedGainFor(
        grower,
        { deshi: true, sex: "male" },
        { deshiPercent: 60, femalePercent: 80 }
      ).expectedGain
    ).toEqual({ lowKg: 0.36, highKg: 0.54 });
  });
});

describe("what a bull should weigh when his Target Window opens", () => {
  const rungs = [
    {
      band: { fromKg: 150, toKg: 250 },
      expectedGain: { lowKg: 0.6, highKg: 0.9 },
    },
    {
      band: { fromKg: 250, toKg: 350 },
      expectedGain: { lowKg: 0.65, highKg: 1 },
    },
  ];
  const shares = { deshiPercent: 70, femalePercent: 80 };
  const cross = { deshi: false, sex: "male" } as const;

  it("grows him after he has settled in, stepping up a band as he crosses it", () => {
    // The research's worked example: 180 kg, 120 days to his window, 99 of them after settling in. Low: 0.6 a day
    // throughout, 180 + 59.4. High: 0.9 a day to 250 kg after 78 days, then 21 days at 1.0.
    expect(grownWeightFor(180, 120, rungs, cross, shares)).toEqual({
      lowKg: 239.4,
      highKg: 271.2,
    });
  });

  it("grows a deshi bull at the farm's deshi share", () => {
    expect(
      grownWeightFor(180, 120, rungs, { deshi: true, sex: "male" }, shares)
    ).toEqual({ lowKg: 221.6, highKg: 242.4 });
  });

  it("grows him not at all within the settling-in weeks", () => {
    expect(grownWeightFor(180, SETTLING_IN_DAYS, rungs, cross, shares)).toEqual(
      { lowKg: 180, highKg: 180 }
    );
  });

  it("goes on at the heaviest band's gain once he is past every band", () => {
    // 340 kg at 0.65–1.0: 10 days to 350 at the high end, then on at 1.0.
    expect(grownWeightFor(340, 21 + 30, rungs, cross, shares)).toEqual({
      lowKg: 359.5,
      highKg: 370,
    });
  });

  it("says nothing when no Ration's band holds him as he comes", () => {
    expect(grownWeightFor(120, 120, rungs, cross, shares)).toBe(null);
    expect(grownWeightFor(200, 120, [], cross, shares)).toBe(null);
  });
});

describe("an animal's gain over her whole stay on a Ration", () => {
  const readings = [
    reading("2027-03-01", 200),
    reading("2027-03-15", 206),
    reading("2027-04-12", 230),
    reading("2027-05-10", 250),
  ];

  it("runs from her first reading in the stay to her last", () => {
    expect(
      gainOverStayOf(readings, {
        from: startOfFarmDay("2027-03-10"),
        until: startOfFarmDay("2027-05-01"),
        readDays: 28,
      })
    ).toEqual({
      // 15 March to 12 April: 24 kg in 28 days.
      dailyGainKg: 0.86,
      overDays: 28,
      from: reading("2027-03-15", 206),
      to: reading("2027-04-12", 230),
    });
  });

  it("says nothing of a stay too short to measure", () => {
    expect(
      gainOverStayOf(readings, {
        from: startOfFarmDay("2027-04-01"),
        until: startOfFarmDay("2027-05-01"),
        readDays: 28,
      })
    ).toBe(null);
  });
});

describe("the kind of animal a gain of the farm's own is said by", () => {
  it("is her sex first, then her breed", () => {
    expect(gainGroupOf({ sex: "female", deshi: true })).toBe("female");
    expect(gainGroupOf({ sex: "male", deshi: true })).toBe("deshi");
    expect(gainGroupOf({ sex: "male", deshi: false })).toBe("cross");
    expect(gainGroupOf({ sex: "male", deshi: null })).toBe("unrecorded");
  });
});

describe("a figure of the farm's own", () => {
  it("is the middle animal and the middle half of them", () => {
    // Sorted: 0.4, 0.5, 0.6, 0.7, 0.8 — the quarter falls on 0.5, the half on 0.6, three quarters on 0.7.
    expect(farmGainFigureOf([0.7, 0.4, 0.8, 0.5, 0.6])).toEqual({
      animals: 5,
      medianKg: 0.6,
      lowKg: 0.5,
      highKg: 0.7,
    });
  });

  it("falls between two animals where the share does", () => {
    // Six: the half falls between 0.6 and 0.7, the quarter a quarter of the way from 0.5 to 0.6.
    expect(farmGainFigureOf([0.4, 0.5, 0.6, 0.7, 0.8, 0.9])).toEqual({
      animals: 6,
      medianKg: 0.65,
      lowKg: 0.53,
      highKg: 0.78,
    });
  });

  it("is not said from fewer than five", () => {
    expect(FEWEST_FOR_A_FIGURE).toBe(5);
    expect(farmGainFigureOf([0.4, 0.5, 0.6, 0.7])).toBe(null);
  });
});
