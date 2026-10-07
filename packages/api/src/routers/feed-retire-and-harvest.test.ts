import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A feed is not retired while a Pen is still fed it or the store holds it, a retired one is fed to no Pen, and a cut from the farm's own fields is priced once the farm says
// what its fodder is worth.

const suffix = `retire-harvest-${Date.now()}`;

const manager = () =>
  createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock("2038-01-05T04:00:00.000Z"),
  });

describe("retiring a feed", () => {
  it("is refused while a Ration a Pen is on still feeds it", async () => {
    const { client } = await manager();
    const shed = await client.sheds.create({ name: suffix });
    const pen = await client.sheds.pens.create({
      shedId: shed.id,
      name: `পেন ${suffix}`,
    });
    const feed = await client.feed.items.create({
      name: { bn: `ভুসি ${suffix}` },
    });
    const ration = await client.feed.rations.save({
      name: { bn: `ভুসির রেশন ${suffix}` },
      items: [{ feedItemId: feed.id, kgPerAnimalPerDay: 2 }],
    });
    await client.feed.rations.assign({
      penId: pen.id,
      rationId: ration.rationId,
    });

    await expect(
      client.feed.items.retire({ id: feed.id })
    ).rejects.toMatchObject({
      data: { refusal: "feed_on_a_ration" },
    });
  });
});

describe("a feed the store still holds", () => {
  it("is not retired until a count brings it to nothing, and an empty one is the Manager's to retire", async () => {
    const { client } = await manager();
    const straw = await client.feed.items.create({
      name: { bn: `খড় ${suffix}` },
    });
    await client.stock.receive({
      feedItemId: straw.id,
      kind: "harvest",
      quantity: 200,
      receivedOn: "2038-01-04",
    });
    await expect(
      client.feed.items.retire({ id: straw.id })
    ).rejects.toMatchObject({
      data: { refusal: "feed_in_the_store", left: 200 },
    });

    const empty = await client.feed.items.create({
      name: { bn: `খালি ${suffix}` },
    });
    await client.feed.items.retire({ id: empty.id });
  });
});

describe("a Ration that feeds a retired feed", () => {
  it("is not given to a Pen", async () => {
    const { client } = await manager();
    const shed = await client.sheds.create({ name: `রেশন ${suffix}` });
    const pen = await client.sheds.pens.create({
      shedId: shed.id,
      name: `পেন ২ ${suffix}`,
    });
    const molasses = await client.feed.items.create({
      name: { bn: `চিটাগুড় ${suffix}` },
    });
    const ration = await client.feed.rations.save({
      name: { bn: `গুড়ের রেশন ${suffix}` },
      items: [{ feedItemId: molasses.id, kgPerAnimalPerDay: 1 }],
    });
    // On no Pen yet, so the feed may be retired.
    await client.feed.items.retire({ id: molasses.id });

    await expect(
      client.feed.rations.assign({ penId: pen.id, rationId: ration.rationId })
    ).rejects.toMatchObject({ data: { refusal: "feed_retired" } });
  });
});

describe("a Harvest cut before its feed had a Fodder Price", () => {
  it("is priced when the Fodder Price is set", async () => {
    const { client } = await manager();
    const napier = await client.feed.items.create({
      name: { bn: `নেপিয়ার ${suffix}` },
    });
    const cut = await client.stock.receive({
      feedItemId: napier.id,
      kind: "harvest",
      quantity: 500,
      receivedOn: "2038-01-04",
    });
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2038-01-05T04:00:00.000Z"),
    });
    await owner.client.feed.items.setFodderPrice({
      feedItemId: napier.id,
      fodderPriceMoney: 3,
    });

    const came = await client.stock.feedIn({});
    expect(came.find((one) => one.id === cut.id)?.priceMoney).toBe(1500);
  });
});
