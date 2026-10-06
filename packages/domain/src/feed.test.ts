import { describe, expect, it } from "vitest";

import {
  countedOverTheBook,
  daysLeftOf,
  fedPerDayOf,
  priceJumped,
  purchasePricesOf,
  scaleShortOf,
  sellersOnTheScale,
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
  shortfallOf,
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

describe("what a Stock Count's differences are worth", () => {
  it("prices each at its own price, keeping what was short apart from what was over", () => {
    expect(
      shortfallOf([
        { difference: -100, priceMoney: 40 },
        { difference: -2.5, priceMoney: 30 },
        { difference: 50, priceMoney: 40 },
      ])
    ).toEqual({ shortMoney: 4075, overMoney: 2000 });
  });

  it("adds nothing for feed never bought, which has no price", () => {
    expect(shortfallOf([{ difference: -300, priceMoney: null }])).toEqual({
      shortMoney: 0,
      overMoney: 0,
    });
  });
});

/** A lot of bran that came in on a farm day. */
const bought = (
  id: string,
  day: string,
  quantity: number,
  priceMoney: number | null,
  kind: "purchase" | "harvest" = "purchase"
) => ({
  id,
  feedItemId: "ভুসি",
  kind,
  quantity,
  priceMoney,
  receivedOn: new Date(`${day}T04:00:00.000Z`),
});

describe("a Feed Purchase's price per unit", () => {
  it("is set against the last purchase of the same feed, per kilo whatever it was bought as", () => {
    // Twenty 37-kilo bags at ৳1,480 each is ৳40 a kilo; the next lot is ৳44.
    const prices = purchasePricesOf([
      bought("a", "2040-01-01", 740, 29_600),
      bought("b", "2040-01-08", 500, 22_000),
    ]);
    expect(prices.get("a")).toEqual({
      unitPriceMoney: 40,
      previousUnitPriceMoney: null,
      changePercent: null,
    });
    expect(prices.get("b")).toEqual({
      unitPriceMoney: 44,
      previousUnitPriceMoney: 40,
      changePercent: 10,
    });
  });

  it("never compares a harvest, nor against one", () => {
    const prices = purchasePricesOf([
      bought("a", "2040-01-01", 100, 4000),
      bought("h", "2040-01-03", 1000, 3000, "harvest"),
      bought("b", "2040-01-08", 100, 4100),
    ]);
    expect(prices.has("h")).toBe(false);
    expect(prices.get("b")?.previousUnitPriceMoney).toBe(40);
  });

  it("puts one written up late where its day falls", () => {
    const prices = purchasePricesOf([
      bought("late", "2040-01-05", 100, 5000),
      bought("a", "2040-01-01", 100, 4000),
      bought("b", "2040-01-08", 100, 5000),
    ]);
    expect(prices.get("late")?.previousUnitPriceMoney).toBe(40);
    expect(prices.get("b")?.changePercent).toBe(0);
  });

  it("has jumped only past the line, and only upward", () => {
    expect(priceJumped({ changePercent: 10 }, 10)).toBe(false);
    expect(priceJumped({ changePercent: 10.1 }, 10)).toBe(true);
    expect(priceJumped({ changePercent: -30 }, 10)).toBe(false);
    expect(priceJumped({ changePercent: null }, 10)).toBe(false);
  });
});

/** A lot a seller sent, weighed on the farm's scale. */
const weighed = (
  sellerName: string,
  slipQuantity: number,
  quantity: number,
  priceMoney: number
) => ({ sellerId: sellerName, sellerName, slipQuantity, quantity, priceMoney });

describe("how short a seller runs on the farm's scale", () => {
  it("claims nothing of a lot never weighed", () => {
    expect(scaleShortOf({ quantity: 500, slipQuantity: null })).toBeNull();
    expect(scaleShortOf({ quantity: 488, slipQuantity: 500 })).toBe(12);
  });

  it("adds a seller's lots up in kilos, percent and taka at what each slip kilo was charged", () => {
    // 500 on the slip at ৳40, 488 on the scale: 12 short, ৳480. 300 at ৳50, 297: 3 short, ৳150.
    const [rashid, other] = sellersOnTheScale([
      weighed("রশিদ", 500, 488, 20_000),
      weighed("রশিদ", 300, 297, 15_000),
      weighed("কামাল", 200, 201, 8000),
    ]);
    expect(rashid).toMatchObject({
      lots: 2,
      slipKg: 800,
      weighedKg: 785,
      shortKg: 15,
      shortPercent: 1.9,
      shortMoney: 630,
    });
    // Over on the scale is below nothing, never netted into another seller.
    expect(other).toMatchObject({ shortKg: -1, shortMoney: -40 });
  });
});

/** A feeding of so much, some days before the moment asked about. */
const fedDaysAgo = (daysAgo: number, quantity: number, now: Date) => ({
  kind: "out" as const,
  at: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
  quantity,
});

describe("how many days of a feed are left", () => {
  const now = new Date("2040-03-15T12:00:00.000Z");

  it("reads the rate over the last fortnight", () => {
    const fortnight = Array.from({ length: 14 }, (_, day) =>
      fedDaysAgo(day + 0.5, 20, now)
    );
    // A month ago it was fed far more; that is not the rate now.
    const perDay = fedPerDayOf([...fortnight, fedDaysAgo(30, 900, now)], now);
    expect(perDay).toBe(20);
    expect(daysLeftOf(150, perDay)).toBe(7);
  });

  it("reads a new feed over the days it has been fed, not the whole fortnight", () => {
    // Fed yesterday and this morning: two farm days, not fourteen.
    const perDay = fedPerDayOf(
      [fedDaysAgo(1, 30, now), fedDaysAgo(0.25, 30, now)],
      now
    );
    expect(perDay).toBe(30);
  });

  it("counts a feeding from the first moment of the fortnight's first farm day, and not one a moment before", () => {
    // At noon on 15 March in Dhaka's evening, the fortnight is the farm days 2 to 15 March: 2 March began at
    // 18:00 on the 1st, London time.
    const first = new Date("2040-03-01T18:00:00.000Z");
    const before = new Date("2040-03-01T17:59:59.000Z");
    const perDay = fedPerDayOf(
      [
        { kind: "out", at: first, quantity: 28 },
        { kind: "out", at: before, quantity: 1000 },
      ],
      now
    );
    expect(perDay).toBe(2);
  });

  it("says nothing of a feed not fed lately, and none left of a store below nothing", () => {
    expect(fedPerDayOf([fedDaysAgo(20, 50, now)], now)).toBe(0);
    expect(daysLeftOf(500, 0)).toBeNull();
    expect(daysLeftOf(-12, 20)).toBe(0);
  });
});

describe("a count against a book below nothing", () => {
  it("finds nothing over in an empty store, where feed was fed from a delivery nobody wrote down", () => {
    expect(countedOverTheBook(0, -50)).toBe(0);
    expect(countedOverTheBook(30, -50)).toBe(30);
    expect(countedOverTheBook(80, 100)).toBe(-20);
  });
});
