import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * What came in, lot by lot: the Lot Number printed on a box of medicine or a bag of feed, and the day it may be
 * used until — kept with the purchase it came in on, because the store is only as safe as its oldest box.
 */
const suffix = `lots-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

describe("a Lot, as it comes in", () => {
  it("keeps a medicine's Lot Number and expiry with the purchase", async () => {
    const manager = await as("manager", "2038-03-01T04:00:00.000Z");
    const product = await manager.client.drugs.add({
      name: { bn: `আইভারমেকটিন ${suffix}` },
    });
    const bought = await manager.client.drugs.purchase({
      drugProductId: product.id,
      quantity: "৫টি ভায়াল",
      doses: 50,
      priceBdt: 2500,
      seller: { name: `ফার্মেসি ${suffix}` },
      purchasedOn: "2038-03-01",
      lotNumber: "IVM-2208",
      expiresOn: "2039-08-31",
    });
    const purchases = await manager.client.drugs.purchases({
      drugProductId: product.id,
    });
    expect(purchases).toEqual([
      expect.objectContaining({
        id: bought.id,
        lotNumber: "IVM-2208",
        expiresOn: "2039-08-31",
      }),
    ]);
  });

  it("refuses medicine that had expired before it was bought", async () => {
    const manager = await as("manager", "2038-03-02T04:00:00.000Z");
    const product = await manager.client.drugs.add({
      name: { bn: `পুরনো ওষুধ ${suffix}` },
    });
    await expect(
      manager.client.drugs.purchase({
        drugProductId: product.id,
        quantity: "১টি ভায়াল",
        doses: 10,
        priceBdt: 500,
        seller: { name: `ফার্মেসি ${suffix}` },
        purchasedOn: "2038-03-02",
        lotNumber: "OLD-1",
        expiresOn: "2038-02-28",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "expired_when_bought" },
    });
  });

  it("keeps a feed delivery's Lot Number and expiry, and needs neither", async () => {
    const manager = await as("manager", "2038-03-03T04:00:00.000Z");
    const premix = await manager.client.feed.addItem({
      name: { bn: `প্রিমিক্স ${suffix}` },
    });
    const bagged = await manager.client.stock.receive({
      feedItemId: premix.id,
      kind: "purchase",
      quantity: 50,
      priceBdt: 6000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2038-03-03",
      lotNumber: "PMX-77",
      expiresOn: "2038-09-30",
    });
    // Hay has no Lot Number and no expiry printed on it, and is taken in all the same.
    const loose = await manager.client.stock.receive({
      feedItemId: premix.id,
      kind: "purchase",
      quantity: 10,
      priceBdt: 1000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2038-03-03",
    });
    const arrivals = await manager.client.stock.arrivals({
      feedItemId: premix.id,
    });
    expect(arrivals.find((one) => one.id === bagged.id)).toMatchObject({
      lotNumber: "PMX-77",
      expiresOn: "2038-09-30",
    });
    expect(arrivals.find((one) => one.id === loose.id)).toMatchObject({
      lotNumber: null,
      expiresOn: null,
    });
    // And feed past its day when it arrives is refused, as medicine is.
    await expect(
      manager.client.stock.receive({
        feedItemId: premix.id,
        kind: "purchase",
        quantity: 5,
        priceBdt: 500,
        seller: { name: `রহমান ফিডস ${suffix}` },
        receivedOn: "2038-03-03",
        expiresOn: "2038-03-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "expired_when_bought" } });
  });
});
