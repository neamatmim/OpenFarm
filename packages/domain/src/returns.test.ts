import { describe, expect, it } from "vitest";

import { returnOf, returnOnCapitalOf, runningRangeOf } from "./returns";

const day = (n: number) => new Date(Date.UTC(2044, 0, 1) + n * 86_400_000);

// Worked by hand. A bull bought for ৳1,00,000 on day 0 and sold for ৳1,70,000 on day 150; his feed bought ৳10,000 at a
// time on days 0, 30, 60 and 90. He cost ৳1,40,000 and made ৳30,000: 21.4 on every hundred. The money was tied up
// 1,00,000 × 150 + 10,000 × (150 + 120 + 90 + 60) = 1,92,00,000 taka-days, over ৳1,40,000 is 137.1 days on average,
// and 21.43 × 365 ÷ 137.14 is 57.0 a year.
const BULL = [
  { amount: 100_000, from: day(0), until: day(150) },
  { amount: 10_000, from: day(0), until: day(150) },
  { amount: 10_000, from: day(30), until: day(150) },
  { amount: 10_000, from: day(60), until: day(150) },
  { amount: 10_000, from: day(90), until: day(150) },
];

describe("what money in cattle returned", () => {
  it("says what every hundred taka made, the days the money was tied up, and that scaled to a year", () => {
    expect(
      returnOf({
        spent: BULL,
        backMoney: 170_000,
        floorDays: 60,
        finished: true,
      })
    ).toEqual({
      costMoney: 140_000,
      backMoney: 170_000,
      resultMoney: 30_000,
      per100: 21.4,
      averageDays: 137,
      perYear: 57,
    });
  });

  it("says a loss the same way, below nothing, a year included", () => {
    // ৳1,33,000 back on ৳1,40,000 is ৳7,000 lost: 5 on every hundred, and 5 × 365 ÷ 137.14 is 13.3 a year.
    const lost = returnOf({
      spent: BULL,
      backMoney: 133_000,
      floorDays: 60,
      finished: true,
    });
    expect(lost?.resultMoney).toBe(-7000);
    expect(lost?.per100).toBe(-5);
    expect(lost?.perYear).toBe(-13.3);
  });

  it("puts nothing a year on money tied up fewer days than the floor", () => {
    const short = returnOf({
      spent: [{ amount: 100_000, from: day(0), until: day(45) }],
      backMoney: 108_000,
      floorDays: 60,
      finished: true,
    });
    expect(short?.per100).toBe(8);
    expect(short?.averageDays).toBe(45);
    expect(short?.perYear).toBeNull();
    // At the floor itself it is put a year: 8 × 365 ÷ 45.
    expect(
      returnOf({
        spent: [{ amount: 100_000, from: day(0), until: day(45) }],
        backMoney: 108_000,
        floorDays: 45,
        finished: true,
      })?.perYear
    ).toBe(64.9);
  });

  it("holds the floor against the days as they are shown, whole", () => {
    // Out 59.6 days, which is said as 60: at a floor of 60 it is put a year, 10 × 365 ÷ 59.6.
    const nearly = returnOf({
      spent: [
        {
          amount: 100_000,
          from: day(0),
          until: new Date(day(59).getTime() + 0.6 * 86_400_000),
        },
      ],
      backMoney: 110_000,
      floorDays: 60,
      finished: true,
    });
    expect(nearly?.averageDays).toBe(60);
    expect(nearly?.perYear).toBe(61.2);
  });

  it("puts nothing a year on cattle not all gone, however long", () => {
    expect(
      returnOf({
        spent: BULL,
        backMoney: 170_000,
        floorDays: 60,
        finished: false,
      })?.perYear
    ).toBeNull();
  });

  it("has no return at all where nothing was spent", () => {
    expect(
      returnOf({ spent: [], backMoney: 10_000, floorDays: 60, finished: true })
    ).toBeNull();
  });
});

describe("the example the Owner decided it on", () => {
  it("reads ৳10 lakh of bulls and ৳4 lakh of feed, ৳17 lakh back, as 21 on every hundred and about 50 a year", () => {
    // Ten bulls at ৳1,00,000, one bought each four days from day 0 to day 36 (six weeks), all sold on day 180. Their
    // feed, ৳4,00,000, bought ৳20,000 a week for twenty weeks from day 30 to day 163. Each bull was out 180, 176, ...,
    // 144 days: ৳1,00,000 × 1,620 = 16,20,00,000 taka-days. Each week's feed was out 150, 143, ..., 17 days: ৳20,000 ×
    // 1,670 = 3,34,00,000. Together 19,54,00,000 over ৳14,00,000 is 139.6 days. ৳3,00,000 on ৳14,00,000 is 21.4 on
    // every hundred, and 21.43 × 365 ÷ 139.57 is 56.0 a year: about fifty.
    const bulls = Array.from({ length: 10 }, (_, i) => ({
      amount: 100_000,
      from: day(i * 4),
      until: day(180),
    }));
    const feed = Array.from({ length: 20 }, (_, i) => ({
      amount: 20_000,
      from: day(30 + i * 7),
      until: day(180),
    }));
    expect(
      returnOf({
        spent: [...bulls, ...feed],
        backMoney: 1_700_000,
        floorDays: 60,
        finished: true,
      })
    ).toEqual({
      costMoney: 1_400_000,
      backMoney: 1_700_000,
      resultMoney: 300_000,
      per100: 21.4,
      averageDays: 140,
      perYear: 56,
    });
  });
});

describe("what the Investors' capital returned", () => {
  it("counts each taka from the day it arrived to the day it was paid back, idle days in", () => {
    // ৳6,00,000 arrived on day 0 and ৳4,00,000 on day 30, all paid back on day 180 with ৳78,000 of profit: 7.8 on
    // every hundred. 6,00,000 × 180 + 4,00,000 × 150 = 16,80,00,000 taka-days over ৳10,00,000 is 168 days, and
    // 7.8 × 365 ÷ 168 is 16.9 a year.
    expect(
      returnOnCapitalOf({
        capital: [
          { amount: 600_000, arrived: day(0), paidBack: day(180) },
          { amount: 400_000, arrived: day(30), paidBack: day(180) },
        ],
        shareMoney: 78_000,
        floorDays: 60,
      })
    ).toEqual({
      capitalMoney: 1_000_000,
      shareMoney: 78_000,
      per100: 7.8,
      averageDays: 168,
      perYear: 16.9,
    });
  });
});

describe("what money still out in cattle is making, at today's price", () => {
  it("puts the part sold and the part standing together, low and high, and never a year", () => {
    // One bull sold: ৳1,00,000 in on day 0, ৳1,30,000 back on day 90. One standing: ৳80,000 in on day 30, worth ৳90,000
    // to ৳1,10,000 today (day 120). Low: ৳1,80,000 cost, ৳2,20,000 back — 22.2 on every hundred. High: ৳2,40,000 back —
    // 33.3. The money was out 1,00,000 × 90 + 80,000 × 90 = 1,62,00,000 taka-days, 90 days on average.
    const range = runningRangeOf({
      sold: {
        spent: [{ amount: 100_000, from: day(0), until: day(90) }],
        backMoney: 130_000,
      },
      standing: {
        spent: [{ amount: 80_000, from: day(30), until: day(120) }],
        lowMoney: 90_000,
        highMoney: 110_000,
      },
    });
    expect(range).toEqual({
      soldCostMoney: 100_000,
      soldResultMoney: 30_000,
      standingCostMoney: 80_000,
      standingLowMoney: 90_000,
      standingHighMoney: 110_000,
      low: {
        costMoney: 180_000,
        backMoney: 220_000,
        resultMoney: 40_000,
        per100: 22.2,
        averageDays: 90,
        perYear: null,
      },
      high: {
        costMoney: 180_000,
        backMoney: 240_000,
        resultMoney: 60_000,
        per100: 33.3,
        averageDays: 90,
        perYear: null,
      },
    });
  });

  it("has no range where nothing can be counted", () => {
    expect(
      runningRangeOf({
        sold: { spent: [], backMoney: 0 },
        standing: { spent: [], lowMoney: 0, highMoney: 0 },
      })
    ).toBeNull();
  });
});
