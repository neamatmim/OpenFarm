import { STANDARD_FEED_ITEMS, STANDARD_RATIONS } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const RATION_NAMES = Object.values(STANDARD_RATIONS)
  .map((one) => one.name.bn)
  .toSorted();

// One farm for the whole file, and the tests run in order: it comes to the standard Rations with feeds it has already
// made its own — counted in bundles, retired, renamed — and each is held as a Ration saved by hand would be.
describe("the standard Rations, asked for by a farm that has its own feeds", () => {
  it("are refused where the farm counts a feed they give by weight in bundles, and nothing is started", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const own = await owner.client.feed.createItem({
      name: { bn: STANDARD_FEED_ITEMS.napier.bn, en: "Our own Napier" },
      unit: "bundle",
    });

    await expect(
      owner.client.farm.startWithStandard({
        kinds: ["feed", "rations", "health"],
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        refusal: "bundles_by_the_head",
        feed: STANDARD_FEED_ITEMS.napier.bn,
      },
    });
    // Refused whole, as a Ration saved by hand is: not the feeds or the medicines asked for with it either.
    const items = await owner.client.feed.items();
    expect(items.map((item) => item.id)).toEqual([own.id]);
    expect(await owner.client.feed.rations()).toEqual([]);
    expect(await owner.client.drugs.list()).toEqual([]);

    // Out of the way, under names of its own, so the standard Napier the Rations weigh out can come in.
    await owner.client.feed.renameItem({
      id: own.id,
      name: { bn: "আঁটির নেপিয়ার", en: "Napier in bundles" },
    });
  });

  it("are refused where a feed they give is retired, until it is brought back", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.farm.startWithStandard({ kinds: ["feed"] });
    const items = await owner.client.feed.items();
    const straw = items.find(
      (item) => item.nameBn === STANDARD_FEED_ITEMS.straw.bn
    );
    await owner.client.feed.retireItem({ id: straw?.id ?? "" });

    await expect(
      owner.client.farm.startWithStandard({ kinds: ["rations"] })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "feed_retired", feed: STANDARD_FEED_ITEMS.straw.bn },
    });
    expect(await owner.client.feed.rations()).toEqual([]);

    await owner.client.feed.bringBackItem({ id: straw?.id ?? "" });
  });

  it("are fed from a standard feed the farm renamed, under the name the farm gave it", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const items = await owner.client.feed.items();
    const napier = items.find(
      (item) => item.nameBn === STANDARD_FEED_ITEMS.napier.bn
    );
    // The farm's Bangla for it, and the English still the standard's: the same feed, by either name.
    await owner.client.feed.renameItem({
      id: napier?.id ?? "",
      name: { bn: "আমাদের নেপিয়ার", en: STANDARD_FEED_ITEMS.napier.en },
    });

    const added = await owner.client.farm.startWithStandard({
      kinds: ["rations"],
    });

    expect(added.feedItems).toEqual([]);
    expect(added.rations.toSorted()).toEqual(RATION_NAMES);
    const rations = await owner.client.feed.rations();
    const milking = rations.find(
      (one) => one.name.bn === STANDARD_RATIONS.milking.name.bn
    );
    expect(milking?.items.map((line) => line.feedItemId)).toContain(napier?.id);
  });
});
