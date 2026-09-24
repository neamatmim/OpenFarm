import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, HOUR } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** Something in the Playbook has to feed, or "how often" has no answer and neither does the
 *  Feeding Target. Twice a day, like the farm's own round. */
const feedingSop = (): SopContent => ({
  name: { bn: "খাওয়ানো", en: "Feeding" },
  purpose: { bn: "রেশন অনুযায়ী খাওয়ান" },
  triggers: [{ kind: "schedule", times: ["06:00", "17:00"] }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "feed",
      text: { bn: "খাওয়ান" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

const setup = async () => {
  const manager = await createTestClient(appRouter, { as: "manager" });
  // Publishing the Playbook is the Owner's.
  const owner = await createTestClient(appRouter, { as: "owner" });
  await owner.client.sops.create({ content: feedingSop() });
  const shed = await manager.client.herd.createShed({
    name: `feed-${Date.now()}`,
  });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "দোহন পেন",
  });
  const empty = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "খালি পেন",
  });
  return { manager, pen, empty };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const aCowIn = async (
  client: Awaited<ReturnType<typeof setup>>["manager"],
  penId: string
) =>
  await client.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });

describe("what a Pen is fed", () => {
  it("works the session's target out from the herd in the Pen, and shows its working", async () => {
    const clock = new FakeClock("2027-05-01T02:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    const concentrate = await manager.client.feed.addItem({
      name: { bn: "দানাদার", en: "Concentrate" },
    });
    const straw = await manager.client.feed.addItem({ name: { bn: "খড়" } });

    const saved = await manager.client.feed.saveRation({
      name: { bn: `দোহন রেশন ${Date.now()}` },
      items: [
        { feedItemId: concentrate.id, kgPerAnimalPerDay: 2.5 },
        { feedItemId: straw.id, kgPerAnimalPerDay: 4 },
      ],
    });
    await manager.client.feed.assignRation({
      penId: world.pen.id,
      rationId: saved.rationId,
    });

    for (let i = 0; i < 3; i += 1) {
      await aCowIn(manager, world.pen.id);
    }

    const target = await manager.client.feed.target({ penId: world.pen.id });
    expect(target.animals).toBe(3);
    expect(target.sessionsPerDay).toBe(2);
    expect(target.items).toEqual([
      {
        feedItemId: concentrate.id,
        nameBn: "দানাদার",
        kgPerAnimalPerDay: 2.5,
        quantity: 3.8,
        unit: "kg",
      },
      {
        feedItemId: straw.id,
        nameBn: "খড়",
        kgPerAnimalPerDay: 4,
        quantity: 6,
        unit: "kg",
      },
    ]);
  });

  it("follows the herd and the Ration, and can still say what yesterday's was", async () => {
    const clock = new FakeClock("2027-06-01T02:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const shed = await manager.client.herd.createShed({
      name: `feed-version-${Date.now()}`,
    });
    const pen = await manager.client.herd.createPen({
      shedId: shed.id,
      name: "পরিবর্তনের পেন",
    });
    const silage = await manager.client.feed.addItem({ name: { bn: "সাইলেজ" } });

    const saved = await manager.client.feed.saveRation({
      name: { bn: `শুরুর রেশন ${Date.now()}` },
      items: [{ feedItemId: silage.id, kgPerAnimalPerDay: 10 }],
    });
    await manager.client.feed.assignRation({
      penId: pen.id,
      rationId: saved.rationId,
    });
    await aCowIn(manager, pen.id);
    await aCowIn(manager, pen.id);

    const first = await manager.client.feed.target({ penId: pen.id });
    expect(first.items[0]?.quantity).toBe(10);
    const asOfFirst = clock.now();

    // A third cow walks in: the same Ration feeds one more animal without anybody saying so.
    clock.advance(HOUR);
    await aCowIn(manager, pen.id);
    const grown = await manager.client.feed.target({ penId: pen.id });
    expect(grown.animals).toBe(3);
    expect(grown.items[0]?.quantity).toBe(15);

    // And the Manager changes what they are fed, which is a new Version of the Ration.
    clock.advance(HOUR);
    await manager.client.feed.saveRation({
      rationId: saved.rationId,
      name: { bn: `শুরুর রেশন ${Date.now()}` },
      items: [{ feedItemId: silage.id, kgPerAnimalPerDay: 12 }],
    });
    const after = await manager.client.feed.target({ penId: pen.id });
    expect(after.ration?.number).toBe(2);
    expect(after.items[0]?.quantity).toBe(18);

    // What the Pen was on before it changed is still answerable, on the herd of the day.
    const before = await manager.client.feed.target({
      penId: pen.id,
      rationAsOf: asOfFirst,
    });
    expect(before.ration?.number).toBe(1);
    expect(before.items[0]?.kgPerAnimalPerDay).toBe(10);
    // The Ration is the one that was in force; the animals are the ones standing there now,
    // because they are who eats.
    expect(before.animals).toBe(3);
    expect(before.items[0]?.quantity).toBe(15);
  });

  it("says a Pen has no Ration rather than showing it nothing to feed", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const target = await manager.client.feed.target({ penId: world.empty.id });
    expect(target.ration).toBeNull();
    expect(target.items).toEqual([]);
  });

  it("keeps a retired Feed Item, because a Ration that fed it still names it", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const molasses = await manager.client.feed.addItem({
      name: { bn: `চিটাগুড়-${Date.now()}` },
    });

    await manager.client.feed.retireItem({ id: molasses.id });

    const items = await manager.client.feed.items();
    const mine = items.find((item) => item.id === molasses.id);
    expect(mine?.retiredAt).not.toBeNull();
  });

  it("refuses a Ration that names a feed this farm does not have", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    await expect(
      manager.client.feed.saveRation({
        name: { bn: `ভুল রেশন ${Date.now()}` },
        items: [{ feedItemId: "not-a-feed", kgPerAnimalPerDay: 1 }],
      })
    ).rejects.toThrow(/not one of this farm's feeds/u);
  });

  it("will not let Staff change what a Pen is fed", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(
      staff.client.feed.saveRation({
        name: { bn: "স্টাফের রেশন" },
        items: [{ feedItemId: "anything", kgPerAnimalPerDay: 1 }],
      })
    ).rejects.toThrow();
  });

  it("feeds two Pens from one Ration, so changing it is one change", async () => {
    const clock = new FakeClock("2027-07-01T02:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const shed = await manager.client.herd.createShed({
      name: `feed-shared-${Date.now()}`,
    });
    const first = await manager.client.herd.createPen({
      shedId: shed.id,
      name: "দোহন ১",
    });
    const second = await manager.client.herd.createPen({
      shedId: shed.id,
      name: "দোহন ২",
    });
    const hay = await manager.client.feed.addItem({
      name: { bn: `খড় ${Date.now()}` },
    });
    const shared = await manager.client.feed.saveRation({
      name: { bn: `দোহনের রেশন ${Date.now()}` },
      items: [{ feedItemId: hay.id, kgPerAnimalPerDay: 6 }],
    });
    for (const pen of [first, second]) {
      await manager.client.feed.assignRation({
        penId: pen.id,
        rationId: shared.rationId,
      });
      await aCowIn(manager, pen.id);
    }

    // One change to the recipe, and both Pens are fed the new figure.
    clock.advance(HOUR);
    await manager.client.feed.saveRation({
      rationId: shared.rationId,
      name: { bn: `দোহনের রেশন ${Date.now()}` },
      items: [{ feedItemId: hay.id, kgPerAnimalPerDay: 8 }],
    });

    for (const pen of [first, second]) {
      const target = await manager.client.feed.target({ penId: pen.id });
      expect(target.ration?.number).toBe(2);
      expect(target.items[0]?.quantity).toBe(4);
    }
  });

  it("does not show a Staff member the Pens that are not theirs", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(
      staff.client.feed.target({ penId: world.empty.id })
    ).rejects.toThrow(/not yours/u);
  });
});

describe("retiring a Ration", () => {
  it("is refused while a Pen is fed on it, and done once the Pen is on another", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const shed = await manager.client.herd.createShed({
      name: `feed-retire-${Date.now()}`,
    });
    const pen = await manager.client.herd.createPen({
      shedId: shed.id,
      name: "পুরনো পেন",
    });
    const hay = await manager.client.feed.addItem({
      name: { bn: `খড় পুরনো ${Date.now()}` },
    });
    const old = await manager.client.feed.saveRation({
      name: { bn: `পুরনো রেশন ${Date.now()}` },
      items: [{ feedItemId: hay.id, kgPerAnimalPerDay: 5 }],
    });
    const next = await manager.client.feed.saveRation({
      name: { bn: `নতুন রেশন ${Date.now()}` },
      items: [{ feedItemId: hay.id, kgPer100KgPerDay: 1 }],
    });
    await manager.client.feed.assignRation({
      penId: pen.id,
      rationId: old.rationId,
    });

    await expect(
      manager.client.feed.retireRation({ id: old.rationId })
    ).rejects.toMatchObject({ data: { refusal: "ration_in_use" } });

    await manager.client.feed.assignRation({
      penId: pen.id,
      rationId: next.rationId,
    });
    await manager.client.feed.retireRation({ id: old.rationId });
    const rations = await manager.client.feed.rations();
    expect(
      rations.find((one) => one.id === old.rationId)?.retiredAt
    ).not.toBeNull();

    // Kept, not removed: its trail says who retired it.
    const trail = await manager.client.audit.list({
      entity: "ration",
      entityId: old.rationId,
    });
    expect(trail.at(0)?.after).toMatchObject({ retiredAt: expect.any(String) });
  });

  it("puts no Pen on a retired Ration until it is brought back", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const hay = await manager.client.feed.addItem({
      name: { bn: `খড় ফেরত ${Date.now()}` },
    });
    const retired = await manager.client.feed.saveRation({
      name: { bn: `অবসরের রেশন ${Date.now()}` },
      items: [{ feedItemId: hay.id, kgPerAnimalPerDay: 5 }],
    });
    await manager.client.feed.retireRation({ id: retired.rationId });

    await expect(
      manager.client.feed.assignRation({
        penId: world.empty.id,
        rationId: retired.rationId,
      })
    ).rejects.toMatchObject({ data: { refusal: "ration_retired" } });

    await manager.client.feed.bringBackRation({ id: retired.rationId });
    await manager.client.feed.assignRation({
      penId: world.empty.id,
      rationId: retired.rationId,
    });
    const rations = await manager.client.feed.rations();
    expect(rations.find((one) => one.id === retired.rationId)).toMatchObject({
      retiredAt: null,
      penIds: [world.empty.id],
    });
  });

  it("is the Owner's and the Manager's", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(
      staff.client.feed.retireRation({ id: "any" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
