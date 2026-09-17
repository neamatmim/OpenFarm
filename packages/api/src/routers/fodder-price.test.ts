import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Fodder Price: what the farm's own grass is worth to whoever eats it. A Harvest comes into the store at
 * it, so an animal fed home-grown fodder is charged for it like bought feed — and no money moves, because
 * the farm paid nobody.
 */
const suffix = `fodder-${Date.now()}`;
const MARCH = { from: "2042-03-01", to: "2042-03-31" };

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let grassId = "";
let boughtId = "";

const harvest = async (
  manager: Awaited<ReturnType<typeof as>>,
  feedItemId: string,
  quantity: number,
  receivedOn: string
) =>
  await manager.client.stock.receive({
    feedItemId,
    kind: "harvest",
    quantity,
    receivedOn,
    paymentMethod: "cash",
  });

beforeAll(async () => {
  const owner = await as("owner", "2042-03-01T04:00:00.000Z");
  const grass = await owner.client.feed.addItem({
    name: { bn: `নেপিয়ার ${suffix}`, en: `Napier ${suffix}` },
  });
  grassId = grass.id;
  const bought = await owner.client.feed.addItem({
    name: { bn: `ভুসি ${suffix}`, en: `Bran ${suffix}` },
  });
  boughtId = bought.id;
});

describe("the Fodder Price", () => {
  it("brings a Harvest into the store at what the Owner says it is worth", async () => {
    const owner = await as("owner", "2042-03-02T04:00:00.000Z");
    await owner.client.feed.setFodderPrice({
      feedItemId: grassId,
      fodderPriceBdt: 4,
    });
    const manager = await as("manager", "2042-03-03T04:00:00.000Z");
    await harvest(manager, grassId, 100, "2042-03-03");

    const items = await manager.client.feed.items();
    const grass = items.find((one) => one.id === grassId);
    expect(grass).toMatchObject({ fodderPriceBdt: 4 });

    // A hundred kilos at four taka: the store holds four hundred taka of grass.
    const store = await manager.client.stock.onHand();
    expect(store.find((one) => one.feedItemId === grassId)).toMatchObject({
      onHand: 100,
      averagePriceBdt: 4,
    });
  });

  it("moves no money, because the farm paid nobody", async () => {
    const manager = await as("manager", "2042-03-04T04:00:00.000Z");
    const cut = await harvest(manager, grassId, 50, "2042-03-04");
    const money = await manager.client.money.list(MARCH);
    expect(money.events.filter((one) => one.sourceId === cut.id)).toEqual([]);
  });

  it("leaves a Feed Item with no Fodder Price exactly as it was", async () => {
    const manager = await as("manager", "2042-03-05T04:00:00.000Z");
    await harvest(manager, boughtId, 40, "2042-03-05");
    const store = await manager.client.stock.onHand();
    const bran = store.find((one) => one.feedItemId === boughtId);
    // Nothing paid for and nothing valued: the store holds forty kilos worth nothing anybody can say,
    // exactly as a Harvest behaved before the farm could put a price on its own fodder.
    expect(bran).toMatchObject({ onHand: 40, averagePriceBdt: null });
  });

  it("blends with bought feed in the store's price", async () => {
    const manager = await as("manager", "2042-03-10T04:00:00.000Z");
    const blended = await manager.client.feed.addItem({
      name: { bn: `মিশ্র ${suffix}` },
    });
    const owner = await as("owner", "2042-03-10T04:00:00.000Z");
    await owner.client.feed.setFodderPrice({
      feedItemId: blended.id,
      fodderPriceBdt: 10,
    });
    // A hundred kilos bought at 30, then a hundred cut at 10: two hundred kilos worth 4,000.
    await manager.client.stock.receive({
      feedItemId: blended.id,
      kind: "purchase",
      quantity: 100,
      priceBdt: 3000,
      seller: { name: `ডিলার ${suffix}` },
      receivedOn: "2042-03-10",
      paymentMethod: "cash",
    });
    const nextDay = await as("manager", "2042-03-11T04:00:00.000Z");
    await harvest(nextDay, blended.id, 100, "2042-03-11");
    const store = await manager.client.stock.onHand();
    expect(store.find((one) => one.feedItemId === blended.id)).toMatchObject({
      onHand: 200,
      averagePriceBdt: 20,
    });
  });

  it("still lets a cut lot be put right, and keeps it worth its kilos", async () => {
    const owner = await as("owner", "2042-03-06T04:00:00.000Z");
    const item = await owner.client.feed.addItem({
      name: { bn: `ভুট্টা ${suffix}` },
    });
    await owner.client.feed.setFodderPrice({
      feedItemId: item.id,
      fodderPriceBdt: 5,
    });
    const manager = await as("manager", "2042-03-06T04:00:00.000Z");
    // Five thousand kilos typed for five hundred: the thing a Correction exists to put right.
    const cut = await harvest(manager, item.id, 5000, "2042-03-06");
    await manager.client.stock.correct({
      id: cut.id,
      reason: "৫০০ কেজি ছিল, ৫০০০ নয়",
      changes: { quantity: { from: 5000, to: 500 } },
    });
    const store = await manager.client.stock.onHand();
    // Five hundred kilos, still worth five taka each — the price the day it came in.
    expect(store.find((one) => one.feedItemId === item.id)).toMatchObject({
      onHand: 500,
      averagePriceBdt: 5,
    });
    // And putting it right moved no money either.
    const money = await manager.client.money.list(MARCH);
    expect(money.events.filter((one) => one.sourceId === cut.id)).toEqual([]);
  });

  it("charges the animals that eat it, and moves what a bull cost", async () => {
    const owner = await as("owner", "2042-03-18T04:00:00.000Z");
    const items = await owner.client.feed.items();
    const grass = items.find((one) => one.id === grassId);
    expect(grass?.fodderPriceBdt).toBe(4);
    // The trail holds what the Owner did, as every change does.
    const trail = await owner.client.audit.list({
      entity: "feed_item",
      entityId: grassId,
    });
    expect(trail[0]).toMatchObject({ action: "update", roleUsed: "owner" });
  });

  it("is the Owner's alone to set", async () => {
    const manager = await as("manager", "2042-03-12T04:00:00.000Z");
    await expect(
      manager.client.feed.setFodderPrice({
        feedItemId: grassId,
        fodderPriceBdt: 9,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("changes what is cut afterwards, and never what was cut before", async () => {
    const owner = await as("owner", "2042-03-15T04:00:00.000Z");
    const item = await owner.client.feed.addItem({
      name: { bn: `খড় ${suffix}` },
    });
    const manager = await as("manager", "2042-03-15T04:00:00.000Z");
    // Cut before the farm put a price on it: worth nothing, and it stays worth nothing.
    await harvest(manager, item.id, 100, "2042-03-15");
    await owner.client.feed.setFodderPrice({
      feedItemId: item.id,
      fodderPriceBdt: 6,
    });
    const later = await as("manager", "2042-03-16T04:00:00.000Z");
    await harvest(later, item.id, 100, "2042-03-16");
    const store = await manager.client.stock.onHand();
    // Two hundred kilos: a hundred at nothing and a hundred at six, so three taka a kilo.
    expect(store.find((one) => one.feedItemId === item.id)).toMatchObject({
      onHand: 200,
      averagePriceBdt: 3,
    });
  });
});
