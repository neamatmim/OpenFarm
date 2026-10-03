import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Feed weighed on the farm's scale as it comes, beside what the seller's slip said: the scale is what the store holds,
// and each seller's lots show how short they run.

const suffix = `weighed-${Date.now()}`;
const NOW = "2068-03-20T04:00:00.000Z";

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let bagged = "";
let loose = "";
let molasses = "";

beforeAll(async () => {
  const manager = await as("manager");
  const inBags = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
    bagSizeKg: 50,
  });
  const byTheKilo = await manager.client.feed.addItem({
    name: { bn: `ভুসি ${suffix}` },
  });
  const byTheLitre = await manager.client.feed.addItem({
    name: { bn: `চিটাগুড় ${suffix}` },
    unit: "litre",
  });
  bagged = inBags.id;
  loose = byTheKilo.id;
  molasses = byTheLitre.id;
});

const RASHID = `রশিদ ট্রেডার্স ${suffix}`;
const KAMAL = `কামাল ফিডস ${suffix}`;

const buy = async (
  feedItemId: string,
  seller: string,
  amount: { quantity: number } | { pack: { kind: "bag"; count: number } },
  priceMoney: number,
  weighed?: number
) => {
  const manager = await as("manager");
  return await manager.client.stock.receive({
    feedItemId,
    kind: "purchase",
    ...amount,
    priceMoney,
    seller: { name: seller },
    receivedOn: "2068-03-15",
    ...(weighed === undefined ? {} : { weighed }),
  });
};

const storeOf = async (feedItemId: string) => {
  const manager = await as("manager");
  const lines = await manager.client.stock.onHand();
  return lines.find((line) => line.feedItemId === feedItemId)?.onHand;
};

describe("feed weighed on arrival", () => {
  it("is what the store holds, the bags' kilos kept as the slip", async () => {
    // Ten 50-kilo bags on the slip; the scale shows 488.
    await buy(
      bagged,
      RASHID,
      { pack: { kind: "bag", count: 10 } },
      20_000,
      488
    );
    expect(await storeOf(bagged)).toBe(488);
    const manager = await as("manager");
    const [lot] = await manager.client.stock.arrivals({ feedItemId: bagged });
    expect(lot).toMatchObject({
      quantity: 488,
      slipQuantity: 500,
      pack: { kind: "bag", count: 10 },
      // Its price per kilo is on what came, not what the slip said.
      unitPriceMoney: 20_000 / 488,
    });
  });

  it("claims no difference for a lot nobody weighed", async () => {
    await buy(loose, KAMAL, { quantity: 300 }, 9000);
    const manager = await as("manager");
    const [lot] = await manager.client.stock.arrivals({ feedItemId: loose });
    expect(lot).toMatchObject({ quantity: 300, slipQuantity: null });
  });

  it("adds each seller's weighed lots up: kilos, percent and taka short", async () => {
    await buy(loose, RASHID, { quantity: 300 }, 15_000, 297);
    await buy(loose, KAMAL, { quantity: 200 }, 6000, 201);
    const manager = await as("manager");
    const sellers = await manager.client.stock.onTheScale();
    // Rashid: 500 on the slips at ৳40 and 300 at ৳50, 12 and 3 short — 15 kilos, ৳630.
    expect(sellers.find((one) => one.sellerName === RASHID)).toMatchObject({
      lots: 2,
      slipKg: 800,
      weighedKg: 785,
      shortKg: 15,
      shortPercent: 1.9,
      shortMoney: 630,
    });
    // Kamal's unweighed lot claims nothing; his weighed one came over.
    expect(sellers.find((one) => one.sellerName === KAMAL)).toMatchObject({
      lots: 1,
      shortKg: -1,
    });
  });

  it("is only for feed bought by the kilo", async () => {
    await expect(
      buy(molasses, KAMAL, { quantity: 40 }, 2400, 39)
    ).rejects.toMatchObject({ data: { refusal: "weighed_needs_a_kilo_slip" } });
  });

  it("leaves a lot out of the sellers' figures once it is ninety days past", async () => {
    const later = await as("manager", "2068-06-20T04:00:00.000Z");
    const sellers = await later.client.stock.onTheScale();
    expect(sellers.find((one) => one.sellerName === RASHID)).toBeUndefined();
  });
});
