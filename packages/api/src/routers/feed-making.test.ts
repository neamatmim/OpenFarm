import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Feed made on the farm (CONTEXT.md **Feed Making**, ADR 0030): a home-mixed concentrate made the same day, and silage
 * packed into a pit and opened a month on. Its inputs leave the store, its made feed comes in worth what went into it,
 * and no money moves — it is a transfer inside the store, not a purchase.
 */
const suffix = `making-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** The store's line for one feed, as the Feed page reads it. */
const lineOf = async (feedItemId: string, instant: string) => {
  const manager = await as("manager", instant);
  const store = await manager.client.stock.onHand();
  return store.find((one) => one.feedItemId === feedItemId);
};

/** What the store holds of one feed. */
const onHandOf = async (feedItemId: string, instant: string) => {
  const line = await lineOf(feedItemId, instant);
  return line?.onHand;
};

/** What a unit of one feed is charged at. */
const priceOf = async (feedItemId: string, instant: string) => {
  const line = await lineOf(feedItemId, instant);
  return line?.averagePriceMoney;
};

const items: Record<string, string> = {};

const buy = async (
  name: string,
  quantity: number,
  priceMoney: number,
  receivedOn: string
) => {
  const manager = await as("manager", `${receivedOn}T03:00:00.000Z`);
  return await manager.client.stock.receive({
    feedItemId: items[name] ?? "",
    kind: "purchase",
    quantity,
    priceMoney,
    seller: { name: `ফিড হাউস ${suffix}` },
    receivedOn,
  });
};

beforeAll(async () => {
  const manager = await as("manager", "2081-03-01T03:00:00.000Z");
  for (const [key, bn, unit] of [
    ["bran", "গমের ভুসি", "kg"],
    ["maize", "ভাঙা ভুট্টা", "kg"],
    ["cake", "সরিষার খৈল", "kg"],
    ["salt", "লবণ", "kg"],
    ["mix", "দানাদার মিশ্রণ", "kg"],
    ["chopped", "কাটা ভুট্টা গাছ", "kg"],
    ["molasses", "চিটাগুড়", "liter"],
    ["silage", "সাইলেজ", "kg"],
  ] as const) {
    // Sequential: one name index.
    // oxlint-disable-next-line no-await-in-loop
    const made = await manager.client.feed.items.create({
      name: { bn: `${bn} ${suffix}` },
      unit,
    });
    items[key] = made.id;
  }
  await buy("bran", 1000, 40_000, "2081-03-01");
  await buy("maize", 500, 17_500, "2081-03-01");
  await buy("cake", 300, 18_000, "2081-03-01");
  await buy("salt", 50, 1000, "2081-03-01");
  await buy("molasses", 200, 10_000, "2081-03-01");
});

describe("a home-mixed concentrate", () => {
  let mixed = "";

  it("takes its inputs out of the store and brings the mix in, worth what went in", async () => {
    const manager = await as("manager", "2081-03-02T05:00:00.000Z");
    // 400 bran at 40, 200 maize at 35, 100 cake at 60 and 10 salt at 20: 16,000 + 7,000 + 6,000 + 200 = 29,200 taka,
    // mixed into 700 kg: 41.71 a kilo.
    const made = await manager.client.feedMaking.make({
      outputFeedItemId: items.mix ?? "",
      madeOn: "2081-03-02",
      inputs: [
        { feedItemId: items.bran ?? "", quantity: 400 },
        { feedItemId: items.maize ?? "", quantity: 200 },
        { feedItemId: items.cake ?? "", quantity: 100 },
        { feedItemId: items.salt ?? "", quantity: 10 },
      ],
      cameOut: { quantity: 700 },
    });
    mixed = made.id;
    expect(
      await lineOf(items.mix ?? "", "2081-03-02T06:00:00.000Z")
    ).toMatchObject({ onHand: 700, averagePriceMoney: 41.71 });
    expect(
      await lineOf(items.bran ?? "", "2081-03-02T06:00:00.000Z")
    ).toMatchObject({ onHand: 600, averagePriceMoney: 40 });
    expect(await onHandOf(items.salt ?? "", "2081-03-02T06:00:00.000Z")).toBe(
      40
    );
  });

  it("is the same making however often the phone sends it", async () => {
    const manager = await as("manager", "2081-03-02T05:00:00.000Z");
    const again = await manager.client.feedMaking.make({
      id: mixed,
      outputFeedItemId: items.mix ?? "",
      madeOn: "2081-03-02",
      inputs: [
        { feedItemId: items.bran ?? "", quantity: 400 },
        { feedItemId: items.maize ?? "", quantity: 200 },
        { feedItemId: items.cake ?? "", quantity: 100 },
        { feedItemId: items.salt ?? "", quantity: 10 },
      ],
      cameOut: { quantity: 700 },
    });
    expect(again.id).toBe(mixed);
    expect(await onHandOf(items.mix ?? "", "2081-03-02T06:00:00.000Z")).toBe(
      700
    );
  });

  it("is listed under «Came in» as made, with what went into it", async () => {
    const manager = await as("manager", "2081-03-02T06:00:00.000Z");
    const arrivals = await manager.client.stock.feedIn({
      feedItemId: items.mix ?? "",
    });
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toMatchObject({
      kind: "made",
      quantity: 700,
      priceMoney: 29_200,
      sellerName: null,
      making: { id: mixed },
    });
    expect(
      arrivals[0]?.making?.inputs.map((one) => [one.feedItemId, one.quantity])
    ).toEqual(
      expect.arrayContaining([
        [items.bran, 400],
        [items.salt, 10],
      ])
    );
    const makings = await manager.client.feedMaking.list();
    const listed = makings.find((one) => one.id === mixed);
    expect(listed).toMatchObject({
      outputFeedItemId: items.mix,
      worthMoney: 29_200,
      madeFeed: { quantity: 700 },
      // Every input in kilos, as the mix is: 710 went in and 700 came out.
      loss: { lost: 10, percent: 1.4 },
    });
    expect(
      listed?.inputs.find((one) => one.feedItemId === items.cake)
    ).toMatchObject({ quantity: 100, unitPriceMoney: 60 });
  });

  it("moves no money: it is feed moved inside the store, never a purchase", async () => {
    const owner = await as("owner", "2081-03-03T05:00:00.000Z");
    const money = await owner.client.money.list({
      from: "2081-03-02",
      to: "2081-03-02",
    });
    expect(money.events).toEqual([]);
  });

  it("is not compared as a purchase when the next lorry of the same feed comes", async () => {
    // The mix came to 41.71 a kilo; bought dearer at 50 the next week, it is the first purchase of it: nothing to
    // compare, and nobody told.
    const bought = await buy("mix", 100, 5000, "2081-03-09");
    const manager = await as("manager", "2081-03-09T05:00:00.000Z");
    const arrivals = await manager.client.stock.feedIn({
      feedItemId: items.mix ?? "",
    });
    expect(arrivals.find((one) => one.id === bought.id)).toMatchObject({
      priceChangePercent: null,
    });
    const told = await scratchDb().query.alert.findMany({
      where: { kind: "feed_price_jump", entityId: bought.id },
    });
    expect(told).toEqual([]);
  });
});

describe("taking from the store", () => {
  it("is refused for more than the store held that day, naming the feed", async () => {
    const manager = await as("manager", "2081-03-04T05:00:00.000Z");
    await expect(
      manager.client.feedMaking.make({
        outputFeedItemId: items.mix ?? "",
        madeOn: "2081-03-04",
        inputs: [
          { feedItemId: items.bran ?? "", quantity: 100 },
          // 300 cake bought, 100 mixed: 200 left.
          { feedItemId: items.cake ?? "", quantity: 250 },
        ],
        cameOut: { quantity: 340 },
      })
    ).rejects.toMatchObject({
      data: {
        refusal: "not_enough_in_the_store",
        short: [{ feedItemId: items.cake, onHand: 200 }],
      },
    });
  });

  it("is refused before the feed came in", async () => {
    const manager = await as("manager", "2081-03-04T05:00:00.000Z");
    await expect(
      manager.client.feedMaking.make({
        outputFeedItemId: items.mix ?? "",
        madeOn: "2081-02-27",
        inputs: [{ feedItemId: items.bran ?? "", quantity: 10 }],
        cameOut: { quantity: 10 },
      })
    ).rejects.toMatchObject({ data: { refusal: "not_enough_in_the_store" } });
  });

  it("does not make a feed from itself", async () => {
    const manager = await as("manager", "2081-03-04T05:00:00.000Z");
    await expect(
      manager.client.feedMaking.make({
        outputFeedItemId: items.mix ?? "",
        madeOn: "2081-03-04",
        inputs: [{ feedItemId: items.mix ?? "", quantity: 10 }],
        cameOut: { quantity: 10 },
      })
    ).rejects.toMatchObject({ data: { refusal: "made_from_itself" } });
  });

  it("is the only way made feed comes in: not typed as a delivery", async () => {
    const manager = await as("manager", "2081-03-04T05:00:00.000Z");
    await expect(
      manager.client.stock.receive({
        feedItemId: items.mix ?? "",
        // A phone that knew the word would still be refused.
        kind: "made" as "harvest",
        quantity: 10,
        receivedOn: "2081-03-04",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is the Owner's and the Manager's, not the barn staff's", async () => {
    const staff = await as("staff", "2081-03-04T05:00:00.000Z");
    await expect(
      staff.client.feedMaking.make({
        outputFeedItemId: items.mix ?? "",
        madeOn: "2081-03-04",
        inputs: [{ feedItemId: items.bran ?? "", quantity: 10 }],
        cameOut: { quantity: 10 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("silage", () => {
  let pit = "";

  it("leaves the store when it is packed, and is not on hand while it is in the pit", async () => {
    const owner = await as("owner", "2081-03-05T03:00:00.000Z");
    await owner.client.feed.items.setFodderPrice({
      feedItemId: items.chopped ?? "",
      fodderPriceMoney: 3,
    });
    const manager = await as("manager", "2081-03-05T04:00:00.000Z");
    await manager.client.stock.receive({
      feedItemId: items.chopped ?? "",
      kind: "harvest",
      quantity: 10_000,
      receivedOn: "2081-03-05",
    });
    // 10 t of chopped maize at 3 a kilo and 100 l of molasses at 50: 35,000 taka packed.
    const packed = await manager.client.feedMaking.make({
      outputFeedItemId: items.silage ?? "",
      madeOn: "2081-03-05",
      readyOn: "2081-04-10",
      note: "উত্তরের গর্ত",
      inputs: [
        { feedItemId: items.chopped ?? "", quantity: 10_000 },
        { feedItemId: items.molasses ?? "", quantity: 100 },
      ],
    });
    pit = packed.id;
    expect(
      await onHandOf(items.chopped ?? "", "2081-03-06T04:00:00.000Z")
    ).toBe(0);
    expect(await onHandOf(items.silage ?? "", "2081-03-06T04:00:00.000Z")).toBe(
      0
    );
    const makings = await manager.client.feedMaking.list();
    expect(makings.find((one) => one.id === pit)).toMatchObject({
      madeFeed: null,
      readyOn: "2081-04-10",
      note: "উত্তরের গর্ত",
      worthMoney: 35_000,
    });
  });

  it("is not running low by its days for being packed: chopping it is not feeding it", async () => {
    const line = await lineOf(items.chopped ?? "", "2081-03-06T04:00:00.000Z");
    expect(line).toMatchObject({ fedPerDay: null, daysLeft: null });
  });

  it("is still the farm's feed at the month's end, at what went into the pit", async () => {
    const owner = await as("owner", "2081-04-02T04:00:00.000Z");
    const { figures } = await owner.client.monthlyReport.month({
      month: "2081-03",
    });
    const withoutThePit = figures.atEnd.store.feedMoney - 35_000;
    // What is on the shelves: bran, maize, cake, salt and molasses less what was mixed, the mix and the bought mix.
    expect(withoutThePit).toBeGreaterThan(0);
    const manager = await as("manager", "2081-04-02T04:00:00.000Z");
    const store = await manager.client.stock.onHand();
    const shelves = store.reduce(
      (sum, one) =>
        sum + Math.max(0, one.onHand) * (one.averagePriceMoney ?? 0),
      0
    );
    expect(figures.atEnd.store.feedMoney).toBeCloseTo(shelves + 35_000, 0);
  });

  it("comes into the store when the pit is opened, priced on what came out", async () => {
    const manager = await as("manager", "2081-04-12T04:00:00.000Z");
    await manager.client.feedMaking.cameOut({
      id: pit,
      quantity: 8500,
      cameOutOn: "2081-04-12",
    });
    // 35,000 taka over the 8,500 kg that came out: 4.12 a kilo — the 1,500 kg the pit lost paid for by what is fed.
    expect(
      await lineOf(items.silage ?? "", "2081-04-12T05:00:00.000Z")
    ).toMatchObject({ onHand: 8500, averagePriceMoney: 4.12 });
    const makings = await manager.client.feedMaking.list();
    expect(makings.find((one) => one.id === pit)).toMatchObject({
      madeFeed: { quantity: 8500 },
      // The molasses is in liters: no loss is said across two units.
      loss: null,
    });
  });

  it("comes out once", async () => {
    const manager = await as("manager", "2081-04-13T04:00:00.000Z");
    await expect(
      manager.client.feedMaking.cameOut({
        id: pit,
        quantity: 8000,
        cameOutOn: "2081-04-13",
      })
    ).rejects.toMatchObject({ data: { refusal: "making_already_out" } });
  });

  it("does not come out before it went in", async () => {
    const manager = await as("manager", "2081-04-13T04:00:00.000Z");
    const packed = await manager.client.feedMaking.make({
      outputFeedItemId: items.silage ?? "",
      madeOn: "2081-04-13",
      inputs: [{ feedItemId: items.molasses ?? "", quantity: 10 }],
    });
    await expect(
      manager.client.feedMaking.cameOut({
        id: packed.id,
        quantity: 8,
        cameOutOn: "2081-04-12",
      })
    ).rejects.toMatchObject({ data: { refusal: "out_before_it_was_made" } });
  });
});

describe("fodder with no Fodder Price", () => {
  it("leaves the made feed unpriced, and priced once the fodder is", async () => {
    const manager = await as("manager", "2081-05-01T04:00:00.000Z");
    const napier = await manager.client.feed.items.create({
      name: { bn: `নেপিয়ার ${suffix}` },
    });
    const napierSilage = await manager.client.feed.items.create({
      name: { bn: `নেপিয়ার সাইলেজ ${suffix}` },
    });
    await manager.client.stock.receive({
      feedItemId: napier.id,
      kind: "harvest",
      quantity: 1000,
      receivedOn: "2081-05-01",
    });
    await manager.client.feedMaking.make({
      outputFeedItemId: napierSilage.id,
      madeOn: "2081-05-01",
      inputs: [
        { feedItemId: napier.id, quantity: 1000 },
        { feedItemId: items.molasses ?? "", quantity: 20 },
      ],
      cameOut: { quantity: 1000 },
    });
    expect(
      await priceOf(napierSilage.id, "2081-05-01T05:00:00.000Z")
    ).toBeNull();
    const owner = await as("owner", "2081-05-02T04:00:00.000Z");
    await owner.client.feed.items.setFodderPrice({
      feedItemId: napier.id,
      fodderPriceMoney: 2,
    });
    // 1,000 kg of napier at 2 and 20 l of molasses at 50: 3,000 taka over 1,000 kg.
    expect(await priceOf(napierSilage.id, "2081-05-02T05:00:00.000Z")).toBe(3);
  });
});

describe("putting a making right", () => {
  let wrong = "";

  beforeAll(async () => {
    const manager = await as("manager", "2081-06-01T04:00:00.000Z");
    const made = await manager.client.feedMaking.make({
      outputFeedItemId: items.mix ?? "",
      madeOn: "2081-06-01",
      inputs: [{ feedItemId: items.bran ?? "", quantity: 100 }],
      cameOut: { quantity: 1000 },
    });
    wrong = made.id;
  });

  it("puts what came out right with a reason, and the price follows", async () => {
    const manager = await as("manager", "2081-06-01T05:00:00.000Z");
    const before = await lineOf(items.mix ?? "", "2081-06-01T05:00:00.000Z");
    await manager.client.feedMaking.correct({
      id: wrong,
      reason: "১০০ কেজি হয়েছিল, ১০০০ নয়",
      changes: { quantity: { from: 1000, to: 100 } },
    });
    const after = await lineOf(items.mix ?? "", "2081-06-01T05:00:00.000Z");
    expect(after?.onHand).toBe((before?.onHand ?? 0) - 900);
  });

  it("puts what went in right, refused past what the store held", async () => {
    const manager = await as("manager", "2081-06-01T06:00:00.000Z");
    await manager.client.feedMaking.correct({
      id: wrong,
      reason: "ভুসি ৯০ কেজি, লবণ ২ কেজি",
      changes: {
        inputs: {
          from: [{ feedItemId: items.bran ?? "", quantity: 100 }],
          to: [
            { feedItemId: items.bran ?? "", quantity: 90 },
            { feedItemId: items.salt ?? "", quantity: 2 },
          ],
        },
      },
    });
    const all = await manager.client.feedMaking.list();
    const listed = all.find((one) => one.id === wrong);
    expect(listed?.inputs.map((one) => one.quantity).toSorted()).toEqual([
      2, 90,
    ]);
    await expect(
      manager.client.feedMaking.correct({
        id: wrong,
        reason: "লবণ আরও",
        changes: {
          inputs: {
            from:
              listed?.inputs
                .map((one) => ({
                  feedItemId: one.feedItemId,
                  quantity: one.quantity,
                }))
                .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId)) ??
              [],
            to: [{ feedItemId: items.salt ?? "", quantity: 5000 }],
          },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "not_enough_in_the_store" } });
  });

  it("voids one never made, putting its inputs back, and is on the trail with the reason", async () => {
    const manager = await as("manager", "2081-06-01T07:00:00.000Z");
    const bran = await lineOf(items.bran ?? "", "2081-06-01T07:00:00.000Z");
    await manager.client.feedMaking.correct({
      id: wrong,
      reason: "দুবার লেখা হয়েছিল",
      changes: { voided: { from: false, to: true } },
    });
    expect(await onHandOf(items.bran ?? "", "2081-06-01T07:00:00.000Z")).toBe(
      (bran?.onHand ?? 0) + 90
    );
    const listed = await manager.client.feedMaking.list();
    expect(listed.find((one) => one.id === wrong)).toBeUndefined();
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "feed_making", entityId: wrong },
      columns: { action: true, reason: true, actorId: true },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(trail.at(-1)).toMatchObject({
      action: "correct",
      reason: "দুবার লেখা হয়েছিল",
      actorId: thePerson("manager").id,
    });
  });

  it("is never put right as a Feed In: its made feed is the making's", async () => {
    // The Owner, whose window never closes: refused for what it is, not for when.
    const owner = await as("owner", "2081-06-02T04:00:00.000Z");
    const [arrival] = await owner.client.stock.feedIn({
      feedItemId: items.silage ?? "",
    });
    await expect(
      owner.client.stock.correct({
        id: arrival?.id ?? "",
        reason: "ভুল",
        changes: { quantity: { from: arrival?.quantity ?? 0, to: 1 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "made_feed_is_its_making" } });
  });
});

describe("a Closed Month", () => {
  it("does not refuse feed made into it, as it does not refuse a Harvest: no money moves", async () => {
    const owner = await as("owner", "2079-01-05T04:00:00.000Z");
    const bran = await owner.client.feed.items.create({
      name: { bn: `জানুয়ারির ভুসি ${suffix}` },
    });
    const mix = await owner.client.feed.items.create({
      name: { bn: `জানুয়ারির মিশ্রণ ${suffix}` },
    });
    await owner.client.stock.receive({
      feedItemId: bran.id,
      kind: "purchase",
      quantity: 100,
      priceMoney: 4000,
      seller: { name: `ফিড হাউস ${suffix}` },
      receivedOn: "2079-01-05",
    });
    const closing = await as("owner", "2079-02-08T04:00:00.000Z");
    await closing.client.monthlyReport.close({ month: "2079-01" });
    // Written up late by the Manager, dated into the closed January.
    const manager = await as("manager", "2079-02-08T05:00:00.000Z");
    await manager.client.feedMaking.make({
      outputFeedItemId: mix.id,
      madeOn: "2079-01-20",
      inputs: [{ feedItemId: bran.id, quantity: 50 }],
      cameOut: { quantity: 50 },
    });
    expect(await priceOf(mix.id, "2079-02-08T06:00:00.000Z")).toBe(40);
  });
});
