import { STANDARD_FEED_ITEMS } from "@OpenFarm/domain";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const asManager = () => createTestClient(appRouter, { as: "manager" });
let manager: Awaited<ReturnType<typeof asManager>>["client"];

beforeAll(async () => {
  ({ client: manager } = await asManager());
});

const refusal = (error: unknown) =>
  (error as { data?: { refusal?: string } }).data?.refusal;

const itemNamed = async (nameBn: string) => {
  const items = await manager.feed.items();
  return items.find((one) => one.nameBn === nameBn);
};

describe("the farm's list of Feed Items", () => {
  // First, because the farm must not have the standard feeds yet.
  it("adds the standard feeds the farm does not have, and leaves the ones it has", async () => {
    await manager.feed.addItem({ name: { bn: "গমের ভুসি" }, unit: "kg" });
    const missing = await manager.feed.standardMissing();

    const first = await manager.feed.addStandardItems();
    const second = await manager.feed.addStandardItems();

    const standard = Object.values(STANDARD_FEED_ITEMS).map((one) => one.bn);
    expect(first.added.toSorted()).toEqual(
      standard.filter((name) => name !== "গমের ভুসি").toSorted()
    );
    // What the farm is told is missing is what adding them adds, and afterwards nothing is.
    expect(missing.map((one) => one.bn).toSorted()).toEqual(
      first.added.toSorted()
    );
    expect(second.added).toEqual([]);
    expect(await manager.feed.standardMissing()).toEqual([]);
    const items = await manager.feed.items();
    expect(items.filter((one) => one.nameBn === "গমের ভুসি")).toHaveLength(1);
  });

  it("refuses a second feed by a name the farm already has, in either language", async () => {
    await manager.feed.addItem({
      name: { bn: "সবুজ ঘাস", en: "Green grass" },
      unit: "kg",
    });

    const byBangla = await manager.feed
      .addItem({ name: { bn: "সবুজ ঘাস" }, unit: "kg" })
      .catch((error: unknown) => error);
    const byEnglish = await manager.feed
      .addItem({ name: { bn: "অন্য ঘাস", en: "green GRASS" }, unit: "kg" })
      .catch((error: unknown) => error);

    expect(refusal(byBangla)).toBe("feed_item_exists");
    expect(refusal(byEnglish)).toBe("feed_item_exists");
  });

  it("renames a feed, and refuses a name another feed has", async () => {
    const { id } = await manager.feed.addItem({
      name: { bn: "ঝোলা গুড়" },
      unit: "litre",
    });

    await manager.feed.renameItem({
      id,
      name: { bn: "চিটাগুড়", en: "Molasses" },
    });
    const clash = await manager.feed
      .renameItem({ id, name: { bn: "লবণ" } })
      .catch((error: unknown) => error);

    expect(await itemNamed("চিটাগুড়")).toMatchObject({
      id,
      nameEn: "Molasses",
      unit: "litre",
    });
    expect(refusal(clash)).toBe("feed_item_exists");
  });

  it("brings a retired feed back onto the list", async () => {
    const { id } = await manager.feed.addItem({
      name: { bn: "খেসারি ভুসি" },
      unit: "kg",
    });
    await manager.feed.retireItem({ id });

    await manager.feed.bringBackItem({ id });

    const back = await itemNamed("খেসারি ভুসি");
    expect(back?.retiredAt).toBeNull();
  });

  it("is the Owner's and the Manager's to keep", async () => {
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });

    await expect(staff.feed.addStandardItems()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
