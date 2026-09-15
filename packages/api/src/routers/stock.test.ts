import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Feed comes in — bought, or cut from the farm's own fields — and goes out through the Feedings the
// pens already record. What is on hand is worked out from both, never typed.

const suffix = `${Date.now()}`;

const feedingSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেনের পশুদের রেশন অনুযায়ী খাওয়ান" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "feed",
      text: { bn: "রেশন অনুযায়ী খাওয়ান" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2034-01-01T00:00:00.000Z");
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const shed = await manager.client.herd.createShed({ name: `st-${suffix}` });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: `খাদ্যের পেন ${suffix}`,
  });
  await manager.client.animals.register({
    sex: "male",
    side: "fattening",
    state: "quarantine",
    penId: pen.id,
    source: "bought",
    aliases: [],
  });
  const concentrate = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  const grass = await manager.client.feed.addItem({
    name: { bn: `নেপিয়ার ঘাস ${suffix}` },
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [
      { feedItemId: concentrate.id, kgPerAnimalPerDay: 4 },
      { feedItemId: grass.id, kgPerAnimalPerDay: 20 },
    ],
  });
  await manager.client.feed.assignRation({
    penId: pen.id,
    rationId: ration.rationId,
  });
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const sop = await owner.client.sops.create({ content: feedingSop() });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-st-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  return { pen, concentrate, grass, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and, eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.sop.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-st-${world.pen.id}`));
});

const managerAt = (at: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(at) });

/** One Feed Item's line on the stock screen. */
const lineFor = async (at: string, feedItemId: string) => {
  const manager = await managerAt(at);
  const stock = await manager.client.stock.onHand();
  return stock.find((line) => line.feedItemId === feedItemId);
};

/** The morning feeding on `day`, recorded with what was actually given. */
const feedOn = async (
  day: string,
  given: { concentrate: number; grass: number }
) => {
  const clock = new FakeClock(`${day}T01:00:00.000Z`);
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId: world.pen.id });
  const work = today.find((row) => row.definitionId === world.sop.definitionId);
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: work?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: work?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [
      { feedItemId: world.concentrate.id, givenKg: given.concentrate },
      { feedItemId: world.grass.id, givenKg: given.grass },
    ],
  });
};

describe("feed stock", () => {
  it("rises with what is bought and harvested, and the price is what was paid", async () => {
    const manager = await managerAt("2034-01-02T04:00:00.000Z");
    // Two bags of concentrate at different prices: 500 kg at ৳40, then 500 kg at ৳50.
    await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "purchase",
      quantity: 500,
      priceBdt: 20_000,
      seller: { name: `রহমান ফিডস ${suffix}`, phone: "01711000000" },
      receivedOn: "2034-01-02",
    });
    await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "purchase",
      quantity: 500,
      priceBdt: 25_000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2034-01-02",
    });
    // Grass cut from the farm's own field, at no price and from nobody.
    await manager.client.stock.receive({
      feedItemId: world.grass.id,
      kind: "harvest",
      quantity: 1000,
      receivedOn: "2034-01-02",
    });

    const concentrate = await lineFor(
      "2034-01-02T05:00:00.000Z",
      world.concentrate.id
    );
    expect(concentrate).toMatchObject({
      onHand: 1000,
      unit: "kg",
      averagePriceBdt: 45,
    });
    const grass = await lineFor("2034-01-02T05:00:00.000Z", world.grass.id);
    // Home-grown: plenty on hand, and no price to average.
    expect(grass).toMatchObject({ onHand: 1000, averagePriceBdt: null });
  });

  it("adds a harvest at no cost, so what the pens are charged is what was paid", async () => {
    const manager = await managerAt("2034-01-03T04:00:00.000Z");
    // Some of the farm's own concentrate — the maize it grew — goes into the same store. It cost nothing,
    // so 1200 kg now stand the farm the ৳45,000 it paid: ৳37.50 a kilo, and no more is charged than
    // was spent.
    await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "harvest",
      quantity: 200,
      receivedOn: "2034-01-03",
    });
    const concentrate = await lineFor(
      "2034-01-03T05:00:00.000Z",
      world.concentrate.id
    );
    expect(concentrate).toMatchObject({ onHand: 1200, averagePriceBdt: 37.5 });
  });

  it("falls with every Feeding, and shows it when it falls below nothing", async () => {
    await feedOn("2034-01-04", { concentrate: 150, grass: 600 });
    await feedOn("2034-01-05", { concentrate: 150, grass: 600 });
    const concentrate = await lineFor(
      "2034-01-05T05:00:00.000Z",
      world.concentrate.id
    );
    expect(concentrate?.onHand).toBe(900);
    // Two days' grass is more than the field gave: the pens were fed all the same, and the store is
    // short by what somebody forgot to write down coming in.
    const grass = await lineFor("2034-01-05T05:00:00.000Z", world.grass.id);
    expect(grass?.onHand).toBe(-200);
    // Feeding takes feed out at the price of the moment and leaves the price where it was.
    expect(concentrate?.averagePriceBdt).toBe(37.5);
  });

  it("averages a new purchase with what is still in the store, not with every purchase ever made", async () => {
    // Concentrate has gone up: 100 kg at ৳60. The 900 kg on hand stood at ৳37.50; the new lot is
    // averaged with those, not with the 1000 kg bought in the new year and long since fed.
    const manager = await managerAt("2034-01-06T04:00:00.000Z");
    const bought = await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "purchase",
      quantity: 100,
      priceBdt: 6000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2034-01-06",
    });
    const concentrate = await lineFor(
      "2034-01-06T05:00:00.000Z",
      world.concentrate.id
    );
    expect(concentrate).toMatchObject({ onHand: 1000, averagePriceBdt: 39.75 });

    // A second tap on the same form is the same lorry.
    await manager.client.stock.receive({
      id: bought.id,
      feedItemId: world.concentrate.id,
      kind: "purchase",
      quantity: 100,
      priceBdt: 6000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2034-01-06",
    });
    const once = await lineFor(
      "2034-01-06T05:00:00.000Z",
      world.concentrate.id
    );
    expect(once?.onHand).toBe(1000);
  });

  it("lets a lot typed wrong be put right, and the store and the price follow", async () => {
    const manager = await managerAt("2034-01-07T04:00:00.000Z");
    // 5000 kg typed for 500: the store swells, and the price sinks with it.
    const typo = await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "purchase",
      quantity: 5000,
      priceBdt: 25_000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2034-01-07",
    });
    const wrong = await lineFor(
      "2034-01-07T05:00:00.000Z",
      world.concentrate.id
    );
    expect(wrong?.onHand).toBe(6000);

    await manager.client.stock.correct({
      id: typo.id,
      changes: { quantity: { from: 5000, to: 500 } },
      reason: "একটা শূন্য বেশি লেখা হয়েছিল",
    });
    const right = await lineFor(
      "2034-01-07T05:00:00.000Z",
      world.concentrate.id
    );
    // 1000 kg at ৳39.75 and 500 kg for ৳25,000: ৳64,750 for 1500 kg.
    expect(right).toMatchObject({ onHand: 1500, averagePriceBdt: 43.17 });

    // And the list of what came in says it, in maunds too.
    const arrivals = await manager.client.stock.arrivals({
      feedItemId: world.concentrate.id,
    });
    expect(arrivals[0]).toMatchObject({
      id: typo.id,
      quantity: 500,
      maunds: 13.4,
      priceBdt: 25_000,
      sellerName: `রহমান ফিডস ${suffix}`,
    });
  });

  it("is the Manager's to record and the Owner's to read, and nobody else's", async () => {
    const at = new FakeClock("2034-01-06T04:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock: at });
    const ownersView = await owner.client.stock.onHand();
    expect(
      ownersView.some((line) => line.feedItemId === world.concentrate.id)
    ).toBe(true);
    await expect(
      owner.client.stock.receive({
        feedItemId: world.concentrate.id,
        kind: "harvest",
        quantity: 10,
        receivedOn: "2034-01-06",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const as of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await createTestClient(appRouter, { as, clock: at });
      // oxlint-disable-next-line no-await-in-loop
      await expect(other.client.stock.onHand()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    // A purchase names its price and its seller; a harvest has neither.
    const manager = await managerAt("2034-01-08T04:00:00.000Z");
    await expect(
      manager.client.stock.receive({
        feedItemId: world.concentrate.id,
        kind: "purchase",
        quantity: 10,
        receivedOn: "2034-01-08",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "purchase_needs_price_and_seller" },
    });
    await expect(
      manager.client.stock.receive({
        feedItemId: world.grass.id,
        kind: "harvest",
        quantity: 10,
        priceBdt: 500,
        receivedOn: "2034-01-08",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "harvest_has_no_price" },
    });
    // Nor does feed come in on a day that has not come yet, or into a retired Feed Item.
    await expect(
      manager.client.stock.receive({
        feedItemId: world.grass.id,
        kind: "harvest",
        quantity: 10,
        receivedOn: "2034-02-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "received_in_the_future" } });
    const old = await manager.client.feed.addItem({
      name: { bn: `পুরনো খাদ্য ${suffix}` },
    });
    await manager.client.feed.retireItem({ id: old.id });
    await expect(
      manager.client.stock.receive({
        feedItemId: old.id,
        kind: "harvest",
        quantity: 10,
        receivedOn: "2034-01-08",
      })
    ).rejects.toMatchObject({ data: { refusal: "feed_retired" } });
  });
});
