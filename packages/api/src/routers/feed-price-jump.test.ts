import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Feed Purchase's price per unit, beside the last purchase of the same feed: shown as the lorry is received, listed
// with the change, and a rise past the Owner's line told to the Owner in the evening's post.

const suffix = `price-jump-${Date.now()}`;
const NOW = "2067-02-10T04:00:00.000Z";

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let concentrate = "";
let bran = "";
let napier = "";

beforeAll(async () => {
  // The farm's Owner, who is told: a farm always has one, and the harness makes each person as they first act.
  const owner = await as("owner");
  const manager = await as("manager");
  // Fifty-kilo bags.
  const bagged = await manager.client.feed.createItem({
    name: { bn: `দানাদার ${suffix}` },
    bagSizeKg: 50,
  });
  const loose = await manager.client.feed.createItem({
    name: { bn: `ভুসি ${suffix}` },
  });
  const grown = await manager.client.feed.createItem({
    name: { bn: `নেপিয়ার ${suffix}` },
  });
  await owner.client.feed.setFodderPrice({
    feedItemId: grown.id,
    fodderPriceMoney: 3,
  });
  concentrate = bagged.id;
  bran = loose.id;
  napier = grown.id;
});

const buy = async (
  feedItemId: string,
  day: string,
  amount: { quantity: number } | { pack: { kind: "bag"; count: number } },
  priceMoney: number
) => {
  const manager = await as("manager");
  return await manager.client.stock.receive({
    feedItemId,
    kind: "purchase",
    ...amount,
    priceMoney,
    seller: { name: `রহমান ফিডস ${suffix}` },
    receivedOn: day,
  });
};

const toldOf = async (arrivalId: string, role: "owner" | "manager") =>
  await scratchDb().query.alert.findMany({
    where: {
      kind: "feed_price_jump",
      entityId: arrivalId,
      userId: thePerson(role).id,
    },
    columns: { params: true },
  });

describe("a Feed Purchase's price per unit", () => {
  it("is set per kilo for a lot bought by the bag, and a rise past the line is told to the Owner alone", async () => {
    // Ten 50-kilo bags for ৳20,000 is ৳40 a kilo; then 300 kilos for ৳13,500 is ৳45, 12.5% dearer.
    await buy(
      concentrate,
      "2067-02-01",
      { pack: { kind: "bag", count: 10 } },
      20_000
    );
    const dearer = await buy(
      concentrate,
      "2067-02-08",
      { quantity: 300 },
      13_500
    );

    const manager = await as("manager");
    const [newest, first] = await manager.client.stock.arrivals({
      feedItemId: concentrate,
    });
    expect(newest).toMatchObject({
      unitPriceMoney: 45,
      priceChangePercent: 12.5,
    });
    expect(first).toMatchObject({
      unitPriceMoney: 40,
      priceChangePercent: null,
    });
    const told = await toldOf(dearer.id, "owner");
    expect(told).toHaveLength(1);
    expect(told[0]?.params).toMatchObject({
      unitPriceMoney: 45,
      previousUnitPriceMoney: 40,
      percent: 12.5,
    });
    expect(await toldOf(dearer.id, "manager")).toEqual([]);
  });

  it("is not told at the line, nor for a fall", async () => {
    await buy(bran, "2067-02-01", { quantity: 100 }, 3000);
    const atTheLine = await buy(bran, "2067-02-05", { quantity: 100 }, 3300);
    const cheaper = await buy(bran, "2067-02-08", { quantity: 100 }, 2000);
    expect(await toldOf(atTheLine.id, "owner")).toEqual([]);
    expect(await toldOf(cheaper.id, "owner")).toEqual([]);
  });

  it("never compares a harvest, nor against one", async () => {
    const owner = await as("owner");
    const cut = await owner.client.stock.receive({
      feedItemId: napier,
      kind: "harvest",
      quantity: 1000,
      receivedOn: "2067-02-02",
    });
    await buy(napier, "2067-02-03", { quantity: 100 }, 800);
    const manager = await as("manager");
    const rows = await manager.client.stock.arrivals({ feedItemId: napier });
    expect(rows.find((row) => row.id === cut.id)).toMatchObject({
      unitPriceMoney: null,
      priceChangePercent: null,
    });
    expect(rows.find((row) => row.id !== cut.id)).toMatchObject({
      unitPriceMoney: 8,
      priceChangePercent: null,
    });
    expect(
      await manager.client.stock.lastPurchase({ feedItemId: napier })
    ).toMatchObject({
      unitPriceMoney: 8,
    });
  });

  it("reads a Correction afresh, and tells once it makes the lot dearer", async () => {
    const item = await as("manager").then((manager) =>
      manager.client.feed.createItem({ name: { bn: `খৈল ${suffix}` } })
    );
    await buy(item.id, "2067-02-01", { quantity: 100 }, 5000);
    const typedLow = await buy(item.id, "2067-02-06", { quantity: 100 }, 5100);
    expect(await toldOf(typedLow.id, "owner")).toEqual([]);

    const manager = await as("manager");
    await manager.client.stock.correct({
      id: typedLow.id,
      reason: `রশিদে ৬,১০০ টাকা, ৫,১০০ নয় ${suffix}`,
      changes: { priceMoney: { from: 5100, to: 6100 } },
    });
    const [newest] = await manager.client.stock.arrivals({
      feedItemId: item.id,
    });
    expect(newest).toMatchObject({
      unitPriceMoney: 61,
      priceChangePercent: 22,
    });
    expect(await toldOf(typedLow.id, "owner")).toHaveLength(1);
  });

  it("is the Owner's line to move, not the Manager's", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.farm.setParameters({ feedPriceJumpPercent: 50 })
    ).rejects.toThrow("Owner");
  });
});
