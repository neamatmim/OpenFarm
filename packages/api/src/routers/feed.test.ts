import { FakeClock, HOUR } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const setup = async () => {
  const manager = await createTestClient(appRouter, { as: "manager" });
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

    await manager.client.feed.setRation({
      penId: world.pen.id,
      name: { bn: "দোহন রেশন" },
      sessionsPerDay: 2,
      items: [
        { feedItemId: concentrate.id, kgPerAnimalPerDay: 2.5 },
        { feedItemId: straw.id, kgPerAnimalPerDay: 4 },
      ],
    });

    for (let i = 0; i < 3; i += 1) {
      await aCowIn(manager, world.pen.id);
    }

    const target = await manager.client.feed.target({ penId: world.pen.id });
    expect(target.headcount).toBe(3);
    expect(target.sessionsPerDay).toBe(2);
    expect(target.items).toEqual([
      {
        feedItemId: concentrate.id,
        nameBn: "দানাদার",
        kgPerAnimalPerDay: 2.5,
        kg: 3.8,
      },
      {
        feedItemId: straw.id,
        nameBn: "খড়",
        kgPerAnimalPerDay: 4,
        kg: 6,
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

    await manager.client.feed.setRation({
      penId: pen.id,
      name: { bn: "শুরুর রেশন" },
      sessionsPerDay: 2,
      items: [{ feedItemId: silage.id, kgPerAnimalPerDay: 10 }],
    });
    await aCowIn(manager, pen.id);
    await aCowIn(manager, pen.id);

    const first = await manager.client.feed.target({ penId: pen.id });
    expect(first.items[0]?.kg).toBe(10);
    const asOfFirst = clock.now();

    // A third cow walks in: the same Ration feeds one more animal without anybody saying so.
    clock.advance(HOUR);
    await aCowIn(manager, pen.id);
    const grown = await manager.client.feed.target({ penId: pen.id });
    expect(grown.headcount).toBe(3);
    expect(grown.items[0]?.kg).toBe(15);

    // And the Manager changes what they are fed, which is a new Version of the Ration.
    clock.advance(HOUR);
    await manager.client.feed.setRation({
      penId: pen.id,
      name: { bn: "শুরুর রেশন" },
      sessionsPerDay: 2,
      items: [{ feedItemId: silage.id, kgPerAnimalPerDay: 12 }],
    });
    const after = await manager.client.feed.target({ penId: pen.id });
    expect(after.ration?.number).toBe(2);
    expect(after.items[0]?.kg).toBe(18);

    // What the Pen was on before it changed is still answerable, on the herd of the day.
    const before = await manager.client.feed.target({
      penId: pen.id,
      at: asOfFirst,
    });
    expect(before.ration?.number).toBe(1);
    expect(before.items[0]?.kgPerAnimalPerDay).toBe(10);
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
      manager.client.feed.setRation({
        penId: world.pen.id,
        name: { bn: "ভুল রেশন" },
        sessionsPerDay: 2,
        items: [{ feedItemId: "not-a-feed", kgPerAnimalPerDay: 1 }],
      })
    ).rejects.toThrow(/not one of this farm's feeds/u);
  });

  it("will not let Staff change what a Pen is fed", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(
      staff.client.feed.setRation({
        penId: world.pen.id,
        name: { bn: "স্টাফের রেশন" },
        sessionsPerDay: 2,
        items: [{ feedItemId: "anything", kgPerAnimalPerDay: 1 }],
      })
    ).rejects.toThrow();
  });
});
