import { describe, expect, it } from "vitest";

import type { StockMovement } from "./feed";
import { fedPerDayOf, priceHistory, stockLedger } from "./feed";
import type { MakingRead } from "./feed-making";
import { bringMakingsIn, inThePitAt, makingLossOf } from "./feed-making";

const at = (iso: string) => new Date(iso);

/** A delivery of so much at so much the lot. */
const bought = (
  when: string,
  quantity: number,
  priceMoney: number | null
): StockMovement => ({ kind: "in", at: at(when), quantity, priceMoney });

const storeOf = (entries: Record<string, StockMovement[]>) =>
  new Map(Object.entries(entries));

describe("a Feed Making in the store", () => {
  it("takes its inputs out and brings its made feed in, worth what went in over what came out", () => {
    // Bran at 40 a kilo, oil cake at 60: 300 kg of bran and 100 of cake mixed into 400 kg of concentrate.
    const store = storeOf({
      bran: [bought("2042-05-01T04:00:00Z", 1000, 40_000)],
      cake: [bought("2042-05-01T04:00:00Z", 200, 12_000)],
    });
    const making: MakingRead = {
      id: "m1",
      madeAt: at("2042-05-03T05:00:00Z"),
      outputFeedItemId: "mix",
      inputs: [
        { feedItemId: "bran", quantity: 300 },
        { feedItemId: "cake", quantity: 100 },
      ],
      madeFeed: {
        arrivalId: "a1",
        at: at("2042-05-03T05:00:00Z"),
        quantity: 400,
      },
    };
    const worths = bringMakingsIn(store, [making]);
    // 300 × 40 + 100 × 60 = 18,000 taka, over 400 kg: 45 a kilo.
    expect(worths.get("m1")).toMatchObject({ worthMoney: 18_000 });
    expect(stockLedger(store.get("mix") ?? [])).toEqual({
      onHand: 400,
      averagePriceMoney: 45,
    });
    expect(stockLedger(store.get("bran") ?? [])).toEqual({
      onHand: 700,
      averagePriceMoney: 40,
    });
    expect(stockLedger(store.get("cake") ?? []).onHand).toBe(100);
  });

  it("prices silage on what came out of the pit, so what the pit lost is paid for by what is fed", () => {
    // 10 t of chopped maize at 3 a kilo and 200 l of molasses at 50: 40,000 taka packed; 8.5 t came out.
    const store = storeOf({
      maize: [bought("2042-05-01T04:00:00Z", 10_000, 30_000)],
      molasses: [bought("2042-05-01T04:00:00Z", 200, 10_000)],
    });
    const worths = bringMakingsIn(store, [
      {
        id: "pit",
        madeAt: at("2042-05-01T06:00:00Z"),
        outputFeedItemId: "silage",
        inputs: [
          { feedItemId: "maize", quantity: 10_000 },
          { feedItemId: "molasses", quantity: 200 },
        ],
        madeFeed: {
          arrivalId: "opened",
          at: at("2042-06-10T03:00:00Z"),
          quantity: 8500,
        },
      },
    ]);
    expect(worths.get("pit")?.worthMoney).toBe(40_000);
    const silage = store.get("silage") ?? [];
    // Nothing to feed while it is in the pit.
    expect(stockLedger(silage, at("2042-05-20T00:00:00Z")).onHand).toBe(0);
    expect(stockLedger(silage)).toEqual({
      onHand: 8500,
      averagePriceMoney: 4.71,
    });
    expect(stockLedger(store.get("maize") ?? []).onHand).toBe(0);
  });

  it("leaves the made feed unpriced while an input has no price, and priced once it has", () => {
    // Napier cut on the farm with no Fodder Price, and molasses bought.
    const unpriced = storeOf({
      napier: [bought("2042-05-01T04:00:00Z", 1000, null)],
      molasses: [bought("2042-05-01T04:00:00Z", 100, 5000)],
    });
    const making = (): MakingRead => ({
      id: "pit",
      madeAt: at("2042-05-02T04:00:00Z"),
      outputFeedItemId: "silage",
      inputs: [
        { feedItemId: "napier", quantity: 1000 },
        { feedItemId: "molasses", quantity: 20 },
      ],
      madeFeed: {
        arrivalId: "opened",
        at: at("2042-06-02T04:00:00Z"),
        quantity: 800,
      },
    });
    expect(bringMakingsIn(unpriced, [making()]).get("pit")?.worthMoney).toBe(
      null
    );
    expect(stockLedger(unpriced.get("silage") ?? []).averagePriceMoney).toBe(
      null
    );
    // The first Fodder Price prices the cut, and the silage with it — nothing to put right by hand.
    const priced = storeOf({
      napier: [bought("2042-05-01T04:00:00Z", 1000, 2000)],
      molasses: [bought("2042-05-01T04:00:00Z", 100, 5000)],
    });
    expect(bringMakingsIn(priced, [making()]).get("pit")?.worthMoney).toBe(
      2000 + 1000
    );
  });

  it("prices a making from a made feed at that feed's own made price", () => {
    const store = storeOf({
      bran: [bought("2042-05-01T04:00:00Z", 100, 4000)],
    });
    const worths = bringMakingsIn(store, [
      // Listed out of order: the later one reads what the earlier one made.
      {
        id: "second",
        madeAt: at("2042-05-05T04:00:00Z"),
        outputFeedItemId: "pellet",
        inputs: [{ feedItemId: "mix", quantity: 50 }],
        madeFeed: {
          arrivalId: "p",
          at: at("2042-05-05T04:00:00Z"),
          quantity: 25,
        },
      },
      {
        id: "first",
        madeAt: at("2042-05-02T04:00:00Z"),
        outputFeedItemId: "mix",
        inputs: [{ feedItemId: "bran", quantity: 100 }],
        madeFeed: {
          arrivalId: "m",
          at: at("2042-05-02T04:00:00Z"),
          quantity: 80,
        },
      },
    ]);
    // 4,000 taka over 80 kg is 50 a kilo; 50 kg of it is 2,500.
    expect(worths.get("second")?.worthMoney).toBe(2500);
    expect(priceHistory(store.get("pellet") ?? [])(at("2042-05-06"))).toBe(100);
  });

  it("is not feeding: a feed taken into a making does not count towards how fast it is fed", () => {
    const store = storeOf({
      maize: [bought("2042-05-01T04:00:00Z", 5000, 15_000)],
    });
    bringMakingsIn(store, [
      {
        id: "pit",
        madeAt: at("2042-05-01T06:00:00Z"),
        outputFeedItemId: "silage",
        inputs: [{ feedItemId: "maize", quantity: 5000 }],
        madeFeed: null,
      },
    ]);
    expect(fedPerDayOf(store.get("maize") ?? [], at("2042-05-03"))).toBe(0);
  });
});

describe("feed in the pit", () => {
  it("is worth what went in from the day it was packed until the day it came out", () => {
    const worths = new Map([
      [
        "pit",
        {
          id: "pit",
          madeAt: at("2042-05-01T06:00:00Z"),
          cameInAt: at("2042-06-10T03:00:00Z"),
          worthMoney: 40_000,
        },
      ],
      [
        "unpriced",
        {
          id: "unpriced",
          madeAt: at("2042-05-02T06:00:00Z"),
          cameInAt: null,
          worthMoney: null,
        },
      ],
      [
        "mix",
        {
          id: "mix",
          madeAt: at("2042-05-03T06:00:00Z"),
          cameInAt: at("2042-05-03T06:00:00Z"),
          worthMoney: 9000,
        },
      ],
    ]);
    expect(inThePitAt(worths, at("2042-04-30T00:00:00Z"))).toEqual({
      worthMoney: 0,
      unpriced: 0,
    });
    expect(inThePitAt(worths, at("2042-05-31T00:00:00Z"))).toEqual({
      worthMoney: 40_000,
      unpriced: 1,
    });
    expect(inThePitAt(worths, at("2042-06-30T00:00:00Z"))).toEqual({
      worthMoney: 0,
      unpriced: 1,
    });
  });
});

describe("what a making lost", () => {
  it("is what went in less what came out, when all of it is in the made feed's unit", () => {
    expect(
      makingLossOf({
        inputs: [
          { quantity: 9000, unit: "kg" },
          { quantity: 1000, unit: "kg" },
        ],
        output: { quantity: 8500, unit: "kg" },
      })
    ).toEqual({ lost: 1500, percent: 15 });
  });

  it("is not said when an input is in another unit", () => {
    expect(
      makingLossOf({
        inputs: [
          { quantity: 9000, unit: "kg" },
          { quantity: 200, unit: "liter" },
        ],
        output: { quantity: 8500, unit: "kg" },
      })
    ).toBeNull();
  });
});
