import { describe, expect, it } from "vitest";

import {
  MAX_KG_PER_100KG_PER_DAY,
  bandStanding,
  findBandProblems,
  SESSIONS_TO_JUDGE,
  WASTING_LEFTOVER_PERCENT,
  findRationProblems,
  herdWeightOf,
  leftoverPercent,
  leftoverStanding,
  roundFeedKg,
  sessionKgOf,
} from "./feed";

// A Pen's Leftovers of one Feed Item over a week, read the way a farmer reads the trough: a lot left behind is feed
// paid for and not eaten; nothing ever left may be a Pen going short, or a feeder not writing it down.

/** A week fed twice a day. */
const WEEK = 14;

describe("where a Pen's Leftovers stand", () => {
  it("is wasting once more than the farm's share of it comes back", () => {
    // 100 kg of straw given, 15 kg left behind: they are given more straw than they eat.
    expect(
      leftoverStanding(
        {
          givenKg: 100,
          leftoverKg: 15,
          sessions: WEEK,
          sessionsWithLeftover: 9,
        },
        { penLeftAnything: true }
      )
    ).toBe("wasting");
  });

  it("is fine with a little left now and then", () => {
    expect(
      leftoverStanding(
        {
          givenKg: 100,
          leftoverKg: WASTING_LEFTOVER_PERCENT,
          sessions: WEEK,
          sessionsWithLeftover: 4,
        },
        { penLeftAnything: true }
      )
    ).toBe("fine");
  });

  it("says when the Pen's trough was never left with a scrap of anything", () => {
    const clearedEverything = {
      givenKg: 100,
      leftoverKg: 0,
      sessions: WEEK,
      sessionsWithLeftover: 0,
    };
    expect(
      leftoverStanding(clearedEverything, { penLeftAnything: false })
    ).toBe("all_eaten");
    // Minerals cleared in a Pen that leaves some napier: a Pen fed enough, not one going short.
    expect(leftoverStanding(clearedEverything, { penLeftAnything: true })).toBe(
      "fine"
    );
  });

  it("says nothing of a Pen fed too seldom to judge", () => {
    // Two meals, both wasted: a new Pen, or a Ration changed yesterday — not yet a pattern.
    expect(
      leftoverStanding(
        {
          givenKg: 10,
          leftoverKg: 5,
          sessions: SESSIONS_TO_JUDGE - 1,
          sessionsWithLeftover: SESSIONS_TO_JUDGE - 1,
        },
        { penLeftAnything: true }
      )
    ).toBe("too_few");
  });

  it("counts what came back against what was given, and nothing given as nothing wasted", () => {
    expect(leftoverPercent({ givenKg: 80, leftoverKg: 6 })).toBe(8);
    expect(leftoverPercent({ givenKg: 0, leftoverKg: 0 })).toBe(0);
  });
});

// A Ration by weight: napier, straw and concentrate grow with the bulls; minerals stay by the head.

/** A morning on the farm's scale. */
const weighedOn = (day: string) => new Date(`${day}T04:00:00.000Z`);

describe("a Ration by weight", () => {
  it("feeds a Pen for what it weighs, and the head-count lines for the heads", () => {
    const herd = { animals: 10, weightKg: 2500 };
    // Three kilos of napier a day for every hundred kilos, fed twice: 37.5 kg this session.
    expect(
      sessionKgOf({ feedItemId: "napier", kgPer100KgPerDay: 3 }, herd, 2)
    ).toBe(37.5);
    // Eighty grams of minerals a head, fed twice: 0.4 kg.
    expect(
      sessionKgOf({ feedItemId: "minerals", kgPerAnimalPerDay: 0.08 }, herd, 2)
    ).toBe(0.4);
  });

  it("gives no figure by weight for a Pen nobody weighed, and still feeds it by the head", () => {
    const herd = { animals: 4, weightKg: null };
    expect(
      sessionKgOf({ feedItemId: "napier", kgPer100KgPerDay: 3 }, herd, 2)
    ).toBeNull();
    expect(
      sessionKgOf({ feedItemId: "minerals", kgPerAnimalPerDay: 0.1 }, herd, 2)
    ).toBe(0.2);
  });

  it("counts an animal nobody weighed at the average of those who were", () => {
    expect(
      herdWeightOf([
        { weightKg: 200, weighedAt: weighedOn("2035-03-01") },
        { weightKg: 300, weighedAt: weighedOn("2035-02-10") },
        // A calf born last night: counted as the Pen's average, 250.
        { weightKg: null, weighedAt: null },
      ])
    ).toEqual({
      weightKg: 750,
      weighed: 2,
      unweighed: 1,
      // The oldest weight used, so a Pen fed on last month's reading shows it.
      oldestWeighedAt: weighedOn("2035-02-10"),
    });
  });

  it("does not make up a weight for a Pen nobody has weighed", () => {
    expect(
      herdWeightOf([
        { weightKg: null, weighedAt: null },
        { weightKg: null, weighedAt: null },
      ])
    ).toEqual({
      weightKg: null,
      weighed: 0,
      unweighed: 2,
      oldestWeighedAt: null,
    });
  });

  it("refuses more by weight than any animal eats", () => {
    expect(
      findRationProblems({
        items: [
          {
            feedItemId: "napier",
            kgPer100KgPerDay: MAX_KG_PER_100KG_PER_DAY + 1,
          },
        ],
      })
    ).toEqual([
      `items[0].kgPer100KgPerDay: between nothing and ${MAX_KG_PER_100KG_PER_DAY} kg a day per 100 kg of body weight`,
    ]);
  });
});

// A Ration's weight band: a grower's 150 to 250 kg, where the finisher takes over at 250.

describe("a Ration's weight band", () => {
  const grower = { fromKg: 150, toKg: 250 };

  it("says a bull has outgrown it the moment the next one takes over", () => {
    expect(bandStanding(249.9, grower)).toBe("fits");
    expect(bandStanding(250, grower)).toBe("outgrown");
  });

  it("says a bull is too light for it below where it starts", () => {
    expect(bandStanding(150, grower)).toBe("fits");
    expect(bandStanding(149, grower)).toBe("too_light");
  });

  it("leaves an open end open", () => {
    expect(bandStanding(900, { fromKg: 350, toKg: null })).toBe("fits");
    expect(bandStanding(40, { fromKg: null, toKg: 150 })).toBe("fits");
  });

  it("refuses a band nobody fits", () => {
    expect(findBandProblems({ fromKg: 250, toKg: 150 })).toEqual([
      "band: From must be below To",
    ]);
    expect(findBandProblems({ fromKg: 0, toKg: null })).toEqual([
      "band.fromKg: a weight above nothing",
    ]);
    expect(findBandProblems(grower)).toEqual([]);
  });
});

// Feed as the farm weighs it: the barn scale for a kilo or more, a small scale for salt and minerals.

describe("a quantity of feed", () => {
  it("is weighed to 100 g from a kilo up", () => {
    expect(roundFeedKg(14.14)).toBe(14.1);
    expect(roundFeedKg(1.04)).toBe(1);
  });

  it("is weighed to 10 g under a kilo, so a pen of two is not told half its salt is nothing", () => {
    // Thirty grams a head, two head, fed twice: thirty grams a feeding.
    expect(roundFeedKg((0.03 * 2) / 2)).toBe(0.03);
    // Fifty grams of minerals stays fifty, where the barn scale made it a hundred.
    expect(roundFeedKg(0.05)).toBe(0.05);
  });

  it("never rounds a need away", () => {
    expect(roundFeedKg(0.004)).toBe(0.01);
    expect(roundFeedKg(0)).toBe(0);
  });

  it("gives a pen of two bulls its salt at every feeding", () => {
    expect(
      sessionKgOf(
        { feedItemId: "salt", kgPerAnimalPerDay: 0.03 },
        { animals: 2, weightKg: 500 },
        2
      )
    ).toBe(0.03);
  });
});
