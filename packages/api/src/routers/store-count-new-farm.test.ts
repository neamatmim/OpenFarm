import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A farm set up this morning starts with the standard feed items and no feed in the store. Its Owner was told, on the
 * first day, that the store had never been counted — a store with nothing in it. The store is late for a count only
 * once feed has come in, and a week and a day has passed without one.
 */
const suffix = `new-store-${Date.now()}`;

const ownerOn = async (instant: string) => {
  const owner = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(instant),
  });
  const home = await owner.client.overview.get();
  return home.needsYou.storeCount;
};

describe("a new farm's store", () => {
  it("is not late for a count before feed has come in, nor in the week and a day after it first does", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2091-05-01T04:00:00.000Z"),
    });
    const bran = await owner.client.feed.items.create({
      name: { bn: `ভুসি ${suffix}` },
    });
    expect(await ownerOn("2091-05-01T08:00:00.000Z")).toBeNull();

    await owner.client.stock.receive({
      feedItemId: bran.id,
      kind: "purchase",
      quantity: 200,
      priceMoney: 6000,
      seller: { name: `দোকান ${suffix}` },
      receivedOn: "2091-05-01",
    });
    expect(await ownerOn("2091-05-08T08:00:00.000Z")).toBeNull();
    // A week and a day after the first feed came in, and still never counted.
    expect(await ownerOn("2091-05-10T08:00:00.000Z")).toEqual({
      lastCountedAt: null,
    });
  });
});
