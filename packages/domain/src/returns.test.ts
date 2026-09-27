import { describe, expect, it } from "vitest";

import { returnOf, returnOnCapitalOf } from "./returns";

const day = (n: number) => new Date(Date.UTC(2044, 0, 1) + n * 86_400_000);

// Worked by hand. A bull bought for ৳1,00,000 on day 0 and sold for ৳1,70,000 on day 150; his feed bought ৳10,000 at a
// time on days 0, 30, 60 and 90. He cost ৳1,40,000 and made ৳30,000: 21.4 on every hundred. The money was tied up
// 1,00,000 × 150 + 10,000 × (150 + 120 + 90 + 60) = 1,92,00,000 taka-days, over ৳1,40,000 is 137.1 days on average,
// and 21.43 × 365 ÷ 137.14 is 57.0 a year.
const BULL = [
  { bdt: 100_000, from: day(0), until: day(150) },
  { bdt: 10_000, from: day(0), until: day(150) },
  { bdt: 10_000, from: day(30), until: day(150) },
  { bdt: 10_000, from: day(60), until: day(150) },
  { bdt: 10_000, from: day(90), until: day(150) },
];

describe("what money in cattle returned", () => {
  it("says what every hundred taka made, the days the money was tied up, and that scaled to a year", () => {
    expect(
      returnOf({
        spent: BULL,
        backBdt: 170_000,
        floorDays: 60,
        finished: true,
      })
    ).toEqual({
      costBdt: 140_000,
      backBdt: 170_000,
      resultBdt: 30_000,
      per100: 21.4,
      averageDays: 137,
      perYear: 57,
    });
  });

  it("says a loss the same way, below nothing, a year included", () => {
    // ৳1,33,000 back on ৳1,40,000 is ৳7,000 lost: 5 on every hundred, and 5 × 365 ÷ 137.14 is 13.3 a year.
    const lost = returnOf({
      spent: BULL,
      backBdt: 133_000,
      floorDays: 60,
      finished: true,
    });
    expect(lost?.resultBdt).toBe(-7000);
    expect(lost?.per100).toBe(-5);
    expect(lost?.perYear).toBe(-13.3);
  });

  it("puts nothing a year on money tied up fewer days than the floor", () => {
    const short = returnOf({
      spent: [{ bdt: 100_000, from: day(0), until: day(45) }],
      backBdt: 108_000,
      floorDays: 60,
      finished: true,
    });
    expect(short?.per100).toBe(8);
    expect(short?.averageDays).toBe(45);
    expect(short?.perYear).toBeNull();
    // At the floor itself it is put a year: 8 × 365 ÷ 45.
    expect(
      returnOf({
        spent: [{ bdt: 100_000, from: day(0), until: day(45) }],
        backBdt: 108_000,
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
          bdt: 100_000,
          from: day(0),
          until: new Date(day(59).getTime() + 0.6 * 86_400_000),
        },
      ],
      backBdt: 110_000,
      floorDays: 60,
      finished: true,
    });
    expect(nearly?.averageDays).toBe(60);
    expect(nearly?.perYear).toBe(61.2);
  });

  it("puts nothing a year on a run not finished, however long", () => {
    expect(
      returnOf({
        spent: BULL,
        backBdt: 170_000,
        floorDays: 60,
        finished: false,
      })?.perYear
    ).toBeNull();
  });

  it("has no return at all where nothing was spent", () => {
    expect(
      returnOf({ spent: [], backBdt: 10_000, floorDays: 60, finished: true })
    ).toBeNull();
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
          { bdt: 600_000, arrived: day(0), paidBack: day(180) },
          { bdt: 400_000, arrived: day(30), paidBack: day(180) },
        ],
        shareBdt: 78_000,
        floorDays: 60,
      })
    ).toEqual({
      capitalBdt: 1_000_000,
      shareBdt: 78_000,
      per100: 7.8,
      averageDays: 168,
      perYear: 16.9,
    });
  });
});
