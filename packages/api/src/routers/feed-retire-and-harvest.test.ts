import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A feed is not retired while a Pen is still fed it, and a cut from the farm's own fields is priced once the farm says
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
