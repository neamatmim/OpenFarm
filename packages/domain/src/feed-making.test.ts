import { describe, expect, it } from "vitest";

import type { StockMovement } from "./feed";
import {
  fedPerDayOf,
  leastOnHandFrom,
  priceHistory,
  stockLedger,
  wentShortFrom,
} from "./feed";
import type { MakingRead } from "./feed-making";
import { bringMakingsIn, inThePitAt, makingLossOf } from "./feed-making";
import { storeValueOf } from "./store-value";

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
    expect(stockLedger(store.get("mix") ?? [])).toMatchObject({
      onHand: 400,
      averagePriceMoney: 45,
    });
    expect(stockLedger(store.get("bran") ?? [])).toMatchObject({
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
    expect(stockLedger(silage)).toMatchObject({
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

describe("a pit opened and written up later", () => {
  it("comes in no earlier than it was packed, though it is dated by the day it was opened", () => {
    const store = storeOf({
      maize: [bought("2042-05-01T04:00:00Z", 1000, 3000)],
    });
    // Packed and opened the same day, the opening written up a week later: dated by the day's start, 00:00.
    bringMakingsIn(store, [
      {
        id: "pit",
        madeAt: at("2042-05-01T06:00:00Z"),
        outputFeedItemId: "silage",
        inputs: [{ feedItemId: "maize", quantity: 1000 }],
        madeFeed: {
          arrivalId: "opened",
          at: at("2042-04-30T18:00:00Z"),
          quantity: 900,
        },
      },
    ]);
    const silage = store.get("silage") ?? [];
    expect(silage.map((one) => one.at.toISOString())).toEqual([
      "2042-05-01T06:00:00.000Z",
    ]);
  });
});

describe("the least the store held from a moment on", () => {
  // 100 kg of bran on the 1st, 20 fed each day from the 2nd to the 5th.
  const fed = (day: number): StockMovement => ({
    kind: "out",
    at: at(`2042-05-0${day}T03:00:00Z`),
    quantity: 20,
  });
  const bran = [
    bought("2042-05-01T03:00:00Z", 100, 4000),
    fed(2),
    fed(3),
    fed(4),
    fed(5),
  ];

  it("is what was left after the last Feeding, not what was there that morning", () => {
    expect(leastOnHandFrom(bran, at("2042-05-02T00:00:00Z"))).toBe(20);
    expect(leastOnHandFrom(bran, at("2042-05-01T12:00:00Z"))).toBe(20);
  });

  it("is what the store holds now, from a moment after everything", () => {
    expect(leastOnHandFrom(bran, at("2042-05-09T00:00:00Z"))).toBe(20);
  });

  it("starts again from a count", () => {
    const counted: StockMovement = {
      kind: "count",
      at: at("2042-05-04T09:00:00Z"),
      counted: 0,
    };
    expect(
      leastOnHandFrom([...bran, counted], at("2042-05-02T00:00:00Z"))
    ).toBe(-20);
  });
});

describe("a write that takes the store short", () => {
  const taken = (day: string, quantity: number): StockMovement => ({
    kind: "out",
    at: at(`2042-05-${day}T06:00:00Z`),
    quantity,
  });
  // 30 kg of corn on the 5th, a Making takes it all on the 8th, and a Feeding takes 40 on the 10th that nobody wrote
  // coming in: the book is already 40 short from the 10th.
  const corn = [
    bought("2042-05-05T03:00:00Z", 30, 900),
    taken("08", 30),
    taken("10", 40),
  ];

  it("is one that holds less than nothing at any moment where the store did not, though its lowest is no lower", () => {
    // The Making moved back to the 2nd: from the 2nd to the 5th the store held nothing, and now holds 30 less.
    const moved = [
      bought("2042-05-05T03:00:00Z", 30, 900),
      taken("02", 30),
      taken("10", 40),
    ];
    expect(wentShortFrom(corn, moved, at("2042-05-02T00:00:00Z"))).toBe(true);
  });

  it("is not one that leaves every moment no shorter than it was, or above nothing", () => {
    const less = [
      bought("2042-05-05T03:00:00Z", 30, 900),
      taken("08", 20),
      taken("10", 40),
    ];
    expect(wentShortFrom(corn, less, at("2042-05-02T00:00:00Z"))).toBe(false);
  });

  it("is one that deepens a shortfall already there", () => {
    const more = [
      bought("2042-05-05T03:00:00Z", 30, 900),
      taken("08", 30),
      taken("10", 50),
    ];
    expect(wentShortFrom(corn, more, at("2042-05-02T00:00:00Z"))).toBe(true);
  });
});

/** The store's worth as the Feed page and the monthly report say it. */
const worthOf = (store: Map<string, StockMovement[]>) =>
  storeValueOf({
    feed: [...store.values()].map((movements) => stockLedger(movements)),
    medicine: [],
  }).feedMoney;

describe("what the store is worth", () => {
  it("is not moved by a Making: feed moved inside the store, at what it was worth", () => {
    // As on the seed farm: six tonnes of concentrate at an average no paisa says exactly, and bran and maize the same.
    const store = () =>
      storeOf({
        concentrate: [bought("2042-05-01T03:00:00Z", 6388.5, 372_700)],
        bran: [bought("2042-05-01T03:00:00Z", 5286.1, 255_850)],
        maize: [bought("2042-05-01T03:00:00Z", 7208.4, 266_430)],
      });
    const before = worthOf(store());
    const after = store();
    bringMakingsIn(after, [
      {
        id: "mix",
        madeAt: at("2042-05-02T04:00:00Z"),
        outputFeedItemId: "concentrate",
        inputs: [
          { feedItemId: "bran", quantity: 50 },
          { feedItemId: "maize", quantity: 30 },
        ],
        madeFeed: {
          arrivalId: "made",
          at: at("2042-05-02T04:00:00Z"),
          quantity: 80,
        },
      },
    ]);
    expect(Math.abs(worthOf(after) - before)).toBeLessThanOrEqual(0.01);
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
