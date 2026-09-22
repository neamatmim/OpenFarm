import {
  STANDARD_DRUGS,
  STANDARD_FEED_ITEMS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_RATIONS,
} from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const ALL = ["feed", "rations", "health"] as const;

/** How many Audit Events there are for these rows, of this entity. */
const eventsFor = async (entity: string, ids: string[]) => {
  const { scratchDb } = await import("@OpenFarm/test-harness");
  const rows = await scratchDb().query.auditEvent.findMany({
    where: { entity, entityId: { in: ids } },
    columns: { entityId: true, action: true },
  });
  return rows;
};

// One farm for the whole file, and it starts empty: the tests run in order, the refusals first, so what they find
// missing is what nobody has added yet.
describe("a farm started with the standard lists", () => {
  it("is the Owner's to start, and never from a shed phone", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const ownerOnPhone = await createTestClient(appRouter, {
      as: "owner",
      onShedPhone: true,
    });

    await expect(
      manager.client.farm.startWithStandard({ kinds: [...ALL] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ownerOnPhone.client.farm.startWithStandard({ kinds: [...ALL] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await manager.client.feed.items()).toEqual([]);
    expect(await manager.client.drugs.list()).toEqual([]);
  });

  it("gives what it asks for, and leaves a name the farm already uses as the farm's", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const own = await owner.client.feed.addItem({
      name: { bn: STANDARD_FEED_ITEMS.napier.bn, en: "Our own Napier" },
      unit: "bundle",
    });

    const added = await owner.client.farm.startWithStandard({
      kinds: [...ALL],
    });

    const standardFeeds = Object.values(STANDARD_FEED_ITEMS).map((f) => f.bn);
    expect(added.feedItems.toSorted()).toEqual(
      standardFeeds
        .filter((bn) => bn !== STANDARD_FEED_ITEMS.napier.bn)
        .toSorted()
    );
    const items = await owner.client.feed.items();
    expect(items.map((item) => item.nameBn).toSorted()).toEqual(
      standardFeeds.toSorted()
    );
    const napier = items.find((item) => item.id === own.id);
    expect(napier).toMatchObject({ nameEn: "Our own Napier", unit: "bundle" });

    // Every Ration is in force at its first Version, fed from this farm's own Feed Items — the Napier its own.
    const rations = await owner.client.feed.rations();
    expect(rations.map((one) => one.name.bn).toSorted()).toEqual(
      Object.values(STANDARD_RATIONS)
        .map((one) => one.name.bn)
        .toSorted()
    );
    const itemIds = new Set(items.map((item) => item.id));
    for (const one of rations) {
      expect(one.number).toBe(1);
      expect(one.penIds).toEqual([]);
      for (const line of one.items) {
        expect(itemIds.has(line.feedItemId)).toBe(true);
      }
    }
    const milking = rations.find(
      (one) => one.name.bn === STANDARD_RATIONS.milking.name.bn
    );
    expect(milking?.items.map((line) => line.feedItemId)).toContain(own.id);

    // On the Drug List for the Vet to finish: no withdrawal days, so nothing may prescribe them yet.
    const drugs = await owner.client.drugs.list();
    expect(drugs).toHaveLength(Object.keys(STANDARD_DRUGS).length);
    for (const drug of drugs) {
      expect(drug).toMatchObject({
        milkWithdrawalDays: null,
        meatWithdrawalDays: null,
        prescribable: false,
        vaccine: false,
      });
    }
    const diseases = await owner.client.notifiable.list();
    expect(diseases.map((one) => one.nameBn).toSorted()).toEqual(
      STANDARD_NOTIFIABLE_DISEASES.map((one) => one.bn).toSorted()
    );
  });

  it("writes each thing it gives into the trail, as if it had been added by hand", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const items = await owner.client.feed.items();
    const given = items.filter(
      (item) => item.nameBn !== STANDARD_FEED_ITEMS.napier.bn
    );
    const rations = await owner.client.feed.rations();
    const drugs = await owner.client.drugs.list();

    const itemEvents = await eventsFor(
      "feed_item",
      given.map((item) => item.id)
    );
    const rationEvents = await eventsFor(
      "ration",
      rations.map((one) => one.id)
    );
    const drugEvents = await eventsFor(
      "drug_product",
      drugs.map((one) => one.id)
    );
    expect(itemEvents).toHaveLength(given.length);
    expect(rationEvents).toHaveLength(rations.length);
    expect(drugEvents).toHaveLength(drugs.length);
    for (const event of [...itemEvents, ...rationEvents, ...drugEvents]) {
      expect(event.action).toBe("create");
    }
  });

  it("adds nothing when it is asked again", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const before = await owner.client.feed.rations();

    const again = await owner.client.farm.startWithStandard({
      kinds: [...ALL],
    });

    expect(again).toEqual({
      feedItems: [],
      rations: [],
      drugs: [],
      diseases: [],
    });
    expect(await owner.client.feed.rations()).toHaveLength(before.length);
  });
});
