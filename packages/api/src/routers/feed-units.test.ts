import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Feed is counted in kilos, litres or bundles, and bought in its own unit or — for kilos — by the bag or the maund. A
// bag weighs what the farm says its bags weigh; a bundle is counted whole; and a line by body weight is for feed that
// can be weighed out, not counted.

const suffix = `units-${Date.now()}`;
const DAY = "2037-02-01";
const NOW = "2037-02-01T04:00:00.000Z";

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const feedingSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
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
  const owner = await as("owner");
  await owner.client.sops.create({ content: feedingSop() });
  const manager = await as("manager");
  const concentrate = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
    bagSizeKg: 50,
  });
  const bran = await manager.client.feed.addItem({
    name: { bn: `ভুসি ${suffix}` },
  });
  const molasses = await manager.client.feed.addItem({
    name: { bn: `চিটাগুড় ${suffix}` },
    unit: "litre",
  });
  const napier = await manager.client.feed.addItem({
    name: { bn: `নেপিয়ার আঁটি ${suffix}` },
    unit: "bundle",
  });
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "আঁটির পেন",
  });
  for (const _ of [1, 2, 3]) {
    // oxlint-disable-next-line no-await-in-loop -- three animals, one after the other
    await manager.client.animals.register({
      sex: "male",
      side: "fattening",
      state: "quarantine",
      penId: pen.id,
      source: "bought",
      aliases: [],
    });
  }
  const ration = await manager.client.feed.saveRation({
    name: { bn: `আঁটির রেশন ${suffix}` },
    items: [
      { feedItemId: napier.id, kgPerAnimalPerDay: 2.5 },
      { feedItemId: bran.id, kgPerAnimalPerDay: 2.5 },
      { feedItemId: molasses.id, kgPer100KgPerDay: 0.1 },
    ],
  });
  await manager.client.feed.assignRation({
    penId: pen.id,
    rationId: ration.rationId,
  });
  return { concentrate, bran, molasses, napier, pen };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const bought = (feedItemId: string) => ({
  feedItemId,
  kind: "purchase" as const,
  priceBdt: 10_000,
  seller: { name: `রহমান ফিডস ${suffix}` },
  receivedOn: DAY,
});

const arrivalOf = async (feedItemId: string) => {
  const manager = await as("manager");
  const [newest] = await manager.client.stock.arrivals({ feedItemId });
  return newest;
};

describe("feed bought by the bag or the maund", () => {
  it("comes into the store in kilos, and keeps what the slip said", async () => {
    const manager = await as("manager");
    await manager.client.stock.receive({
      ...bought(world.concentrate.id),
      pack: { kind: "bag", count: 4 },
    });
    expect(await arrivalOf(world.concentrate.id)).toMatchObject({
      quantity: 200,
      unit: "kg",
      pack: { kind: "bag", count: 4 },
    });
    await manager.client.stock.receive({
      ...bought(world.bran.id),
      pack: { kind: "maund", count: 2 },
    });
    // Two maunds are 74.648 kg, kept to the hundred grams.
    expect(await arrivalOf(world.bran.id)).toMatchObject({
      quantity: 74.6,
      pack: { kind: "maund", count: 2 },
    });
  });

  it("is refused by the bag until the farm says what its bags weigh", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.stock.receive({
        ...bought(world.bran.id),
        pack: { kind: "bag", count: 3 },
      })
    ).rejects.toMatchObject({ data: { refusal: "bag_size_unknown" } });
    await manager.client.feed.setBagSize({
      feedItemId: world.bran.id,
      bagSizeKg: 25,
    });
    await manager.client.stock.receive({
      ...bought(world.bran.id),
      pack: { kind: "bag", count: 3 },
    });
    expect(await arrivalOf(world.bran.id)).toMatchObject({ quantity: 75 });
    const items = await manager.client.feed.items();
    expect(items.find((one) => one.id === world.bran.id)).toMatchObject({
      bagSizeKg: 25,
    });
  });

  it("is refused for feed not weighed in kilos, in bags or in maunds", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.stock.receive({
        ...bought(world.molasses.id),
        pack: { kind: "maund", count: 1 },
      })
    ).rejects.toMatchObject({ data: { refusal: "pack_needs_kg" } });
    await expect(
      manager.client.feed.setBagSize({
        feedItemId: world.napier.id,
        bagSizeKg: 20,
      })
    ).rejects.toMatchObject({ data: { refusal: "pack_needs_kg" } });
    await expect(
      manager.client.feed.addItem({
        name: { bn: `বস্তায় গুড় ${suffix}` },
        unit: "litre",
        bagSizeKg: 20,
      })
    ).rejects.toMatchObject({ data: { refusal: "pack_needs_kg" } });
  });

  it("takes how much in one way, not both and not neither", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.stock.receive({
        ...bought(world.concentrate.id),
        quantity: 200,
        pack: { kind: "bag", count: 4 },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      manager.client.stock.receive(bought(world.concentrate.id))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("forgets the bags once a Correction puts the kilos right", async () => {
    const manager = await as("manager");
    const arrival = await arrivalOf(world.concentrate.id);
    await manager.client.stock.correct({
      id: arrival?.id ?? "",
      reason: `একটা বস্তা ফাটা ছিল ${suffix}`,
      changes: { quantity: { from: 200, to: 190 } },
    });
    expect(await arrivalOf(world.concentrate.id)).toMatchObject({
      quantity: 190,
      pack: null,
    });
  });
});

describe("feed counted in bundles", () => {
  it("is fed in whole bundles", async () => {
    const manager = await as("manager");
    const target = await manager.client.feed.target({ penId: world.pen.id });
    const quantityOf = (feedItemId: string) =>
      target.items.find((one) => one.feedItemId === feedItemId)?.quantity;
    // Three animals at two and a half a day, in two sessions: 3.75 each time — four bundles, but 3.8 kg of bran.
    expect(quantityOf(world.napier.id)).toBe(4);
    expect(quantityOf(world.bran.id)).toBe(3.8);
  });

  it("goes by the head, not by body weight", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.feed.saveRation({
        name: { bn: `ওজনে আঁটি ${suffix}` },
        items: [{ feedItemId: world.napier.id, kgPer100KgPerDay: 1 }],
      })
    ).rejects.toMatchObject({ data: { refusal: "bundles_by_the_head" } });
  });
});
