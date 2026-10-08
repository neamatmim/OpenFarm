import { describe, expect, it } from "vitest";

import type { DairyAnimalRead, DairyBooks } from "./dairy-returns";
import { dairyRunOf, milkPricesByMonth } from "./dairy-returns";
import type { Charge } from "./holding";

// A cow bought for ৳80,000 from 1 January 2032, milked to Bulk in January and February.
const now = new Date("2032-06-01T06:00:00.000Z");

const cow = (more: Partial<DairyAnimalRead> = {}): DairyAnimalRead => ({
  id: "১",
  tagNumber: "D-1",
  state: "milking",
  source: "bought",
  damId: null,
  birthDate: null,
  createdAt: new Date("2031-12-01T06:00:00.000Z"),
  entryPrice: { priceMoney: 80_000, asOf: "2032-01-01" },
  ...more,
});

const feed = (at: string, amount: number): Charge => ({
  kind: "feed",
  animalId: "১",
  side: "dairy",
  at: new Date(at),
  amount,
  fromId: "ঘাস",
  unpricedKg: 0,
  priced: true,
});

const books = (more: Partial<DairyBooks> = {}): DairyBooks => ({
  charges: new Map([["১", [feed("2032-01-10T02:00:00.000Z", 6000)]]]),
  liters: new Map([
    [
      "১",
      [
        {
          at: new Date("2032-01-15T01:00:00.000Z"),
          side: "dairy",
          liters: 300,
        },
        {
          at: new Date("2032-02-15T01:00:00.000Z"),
          side: "dairy",
          liters: 200,
        },
      ],
    ],
  ]),
  animals: [{ id: "১", tagNumber: "D-1", sale: null }],
  ownedThenBy: () => null,
  joinings: [],
  internal: [],
  died: new Map(),
  lost: new Map(),
  ...more,
});

// January's milk went at ৳60 a liter; February had no Dispatch.
const january = milkPricesByMonth([
  {
    dispatchedAt: new Date("2032-01-20T04:00:00.000Z"),
    liters: 1000,
    pricePerLiterMoney: 60,
  },
]);
const heads = new Map([["milking", { lowMoney: 90_000, highMoney: 110_000 }]]);

describe("a dairy Animal's run", () => {
  it("prices a month with no Dispatch at the month before's, and says so", () => {
    const { run } = dairyRunOf(books(), cow(), january, heads, 60, now);
    expect(run).toMatchObject({
      milkLiters: 500,
      milkMoney: 30_000,
      milkPricedEarlier: ["2032-02"],
      worthToday: { lowMoney: 90_000, highMoney: 110_000 },
      gaps: [],
    });
  });

  it("names her, whole, where her milk went before any Dispatch had a price", () => {
    const { run } = dairyRunOf(books(), cow(), new Map(), heads, 60, now);
    expect(run.gaps).toEqual([{ tagNumber: "D-1", why: "no_milk_price" }]);
    expect(run.running).toBeNull();
  });

  it("brings nothing back for a cow who died, her milk and her cost in", () => {
    const { run } = dairyRunOf(
      books({ died: new Map([["১", new Date("2032-03-01T06:00:00.000Z")]]) }),
      cow(),
      january,
      heads,
      60,
      now
    );
    expect(run.left?.how).toBe("died");
    expect(run.endMoney).toBe(0);
    // ৳30,000 of milk back against ৳86,000 — her price and her feed.
    expect(run.resultMoney).toBe(-56_000);
    expect(run.returnOnCost?.resultMoney).toBe(-56_000);
  });

  it("names her until her crossing to Fattening is priced", () => {
    const crossed = books({
      joinings: [
        {
          id: "j",
          animalId: "১",
          joinedAt: new Date("2032-03-01T06:00:00.000Z"),
          how: "crossed",
          priceMoney: null,
          internalSaleId: null,
          targetWindowStart: "2032-05-15",
          targetWindowEnd: "2032-05-17",
        },
      ],
    });
    const { run } = dairyRunOf(crossed, cow(), january, heads, 60, now);
    expect(run.left?.how).toBe("crossed");
    expect(run.gaps).toEqual([{ tagNumber: "D-1", why: "not_priced" }]);
    expect(run.returnOnCost).toBeNull();
  });

  it("counts a calf bred here from her birth, at nothing", () => {
    const calf = cow({
      source: "born",
      damId: "মা",
      entryPrice: null,
      birthDate: new Date("2032-01-01T00:00:00.000Z"),
      state: "calf",
    });
    const { run } = dairyRunOf(
      books({ liters: new Map() }),
      calf,
      january,
      new Map([["calf", { lowMoney: 12_000, highMoney: 18_000 }]]),
      60,
      now
    );
    expect(run).toMatchObject({ came: "born", costMoney: 6000, gaps: [] });
  });
});
