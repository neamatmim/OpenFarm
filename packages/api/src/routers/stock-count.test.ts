import { like } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The weekly Stock Count: somebody counts what is really in the store, and the count wins. Every
// difference is an adjustment with a reason, never quietly absorbed. And a Feed Item running low is
// something the Manager is told about before the concentrate runs out.

const suffix = `${Date.now()}`;

/** The count, raised by hand once a week: one Step, and the Step counts the store. */
const countSop = (): SopContent => ({
  name: { bn: `গুদাম গণনা ${suffix}`, en: "Stock count" },
  purpose: { bn: "গুদামে আসলে কী আছে তা গোনা" },
  triggers: [],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "count",
      text: { bn: "প্রতিটি খাদ্য গুনুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "stock_count" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2035-01-01T04:00:00.000Z");
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const shed = await manager.client.herd.createShed({ name: `sc-${suffix}` });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: `গুদাম ${suffix}`,
  });
  const concentrate = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  const grass = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  await manager.client.stock.receive({
    feedItemId: concentrate.id,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 40_000,
    seller: { name: `রহমান ফিডস ${suffix}` },
    receivedOn: "2035-01-01",
  });
  await manager.client.stock.receive({
    feedItemId: grass.id,
    kind: "harvest",
    quantity: 500,
    receivedOn: "2035-01-01",
  });
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const sop = await owner.client.sops.create({ content: countSop() });
  return { pen, concentrate, grass, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { eq } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
});

const managerAt = (at: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(at) });

const lineFor = async (at: string, feedItemId: string) => {
  const manager = await managerAt(at);
  const stock = await manager.client.stock.onHand();
  return stock.find((line) => line.feedItemId === feedItemId);
};

/** This week's count, raised by hand on `day` and claimed by the Manager. */
const countWork = async (day: string, { claim = true } = {}) => {
  const manager = await managerAt(`${day}T04:00:00.000Z`);
  await manager.client.instances.raiseNow({
    definitionId: world.sop.definitionId,
    penId: world.pen.id,
  });
  const today = await manager.client.instances.today({ penId: world.pen.id });
  const work = today.find(
    (row) => row.definitionId === world.sop.definitionId && row.state === "due"
  );
  if (claim) {
    await manager.client.instances.claim({ id: work?.id ?? "" });
  }
  return { id: work?.id ?? "", manager };
};

describe("the stock count", () => {
  it("wins over what the store was thought to hold, and every difference has a reason", async () => {
    const { id, manager } = await countWork("2035-01-08");

    // The board says what to count, and does not say what the store is thought to hold: a count
    // that can see the answer is a count that copies it.
    const board = await manager.client.instances.get({ id });
    expect(board.stockCount?.items.map((item) => item.feedItemId)).toEqual(
      expect.arrayContaining([world.concentrate.id, world.grass.id])
    );
    expect(board.stockCount?.items[0]).not.toHaveProperty("onHand");

    // Fifty kilos short, and nobody says why: refused.
    await expect(
      manager.client.instances.completeStep({
        instanceId: id,
        stepId: "count",
        evidence: [true],
        counts: [
          { feedItemId: world.concentrate.id, counted: 950 },
          { feedItemId: world.grass.id, counted: 500 },
        ],
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "difference_needs_reason" },
    });

    await manager.client.instances.completeStep({
      instanceId: id,
      stepId: "count",
      evidence: [true],
      counts: [
        {
          feedItemId: world.concentrate.id,
          counted: 950,
          reason: "ইঁদুরে কেটেছে",
        },
        { feedItemId: world.grass.id, counted: 500 },
      ],
    });

    const concentrate = await lineFor(
      "2035-01-08T05:00:00.000Z",
      world.concentrate.id
    );
    // The count is what is on hand now, and a count moves no price: the farm paid what it paid.
    expect(concentrate).toMatchObject({ onHand: 950, averagePriceBdt: 40 });
    const adjustments = await manager.client.stock.adjustments({
      feedItemId: world.concentrate.id,
    });
    expect(adjustments).toMatchObject([
      { expected: 1000, counted: 950, difference: -50, reason: "ইঁদুরে কেটেছে" },
    ]);
    // A line that matched is no adjustment at all.
    const grassAdjustments = await manager.client.stock.adjustments({
      feedItemId: world.grass.id,
    });
    expect(grassAdjustments).toEqual([]);
  });

  it("is where the store is counted from afterwards, and a corrected count books its difference once", async () => {
    const manager = await managerAt("2035-01-09T04:00:00.000Z");
    await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "purchase",
      quantity: 100,
      priceBdt: 4000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2035-01-09",
    });
    const after = await lineFor(
      "2035-01-09T05:00:00.000Z",
      world.concentrate.id
    );
    expect(after?.onHand).toBe(1050);

    // The count was 900, not 950: put right, the difference is re-booked rather than added to.
    const [booked] = await manager.client.stock.adjustments({
      feedItemId: world.concentrate.id,
    });
    await manager.client.instances.correctStep({
      completionId: booked?.completionId ?? "",
      evidence: [true],
      counts: [
        {
          feedItemId: world.concentrate.id,
          counted: 900,
          reason: "ইঁদুরে কেটেছে, আবার গোনা",
        },
        { feedItemId: world.grass.id, counted: 500 },
      ],
      reason: "গোনায় ভুল ছিল",
    });
    const recounted = await lineFor(
      "2035-01-09T05:00:00.000Z",
      world.concentrate.id
    );
    expect(recounted?.onHand).toBe(1000);
    const adjustments = await manager.client.stock.adjustments({
      feedItemId: world.concentrate.id,
    });
    expect(adjustments).toMatchObject([{ counted: 900, difference: -100 }]);
  });

  it("is the Manager's to make", async () => {
    // Unclaimed, so nothing but the count's own rule stands between the Owner and the Step.
    const { id } = await countWork("2035-01-10", { claim: false });
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2035-01-10T04:30:00.000Z"),
    });
    await expect(
      owner.client.instances.completeStep({
        instanceId: id,
        stepId: "count",
        evidence: [true],
        counts: [{ feedItemId: world.grass.id, counted: 500 }],
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "manager_only" },
    });
  });
});

describe("running low", () => {
  it("puts a Feed Item below its threshold in front of the Manager and the Owner, until more comes in", async () => {
    const manager = await managerAt("2035-01-11T04:00:00.000Z");
    // Concentrate at 1000 kg, and the farm wants to hear below 1200.
    await manager.client.feed.setLowStock({
      feedItemId: world.concentrate.id,
      threshold: 1200,
    });
    try {
      const home = await manager.client.home.manager();
      expect(home.queue.lowStock).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            feedItemId: world.concentrate.id,
            onHand: 1000,
            threshold: 1200,
          }),
        ])
      );
      const owner = await createTestClient(appRouter, {
        as: "owner",
        clock: new FakeClock("2035-01-11T04:00:00.000Z"),
      });
      const ownersHome = await owner.client.home.owner();
      expect(
        ownersHome.needsYou.lowStock.map((line) => line.feedItemId)
      ).toContain(world.concentrate.id);

      // The Manager is told, in the digest and not by a buzz. Swept on a clock earlier than anything
      // else on this shared farm: the sweep also tells everybody about every piece of work late by
      // then, and a sweep dated 2035 would fill the Manager's inbox with the rest of the suite's work.
      const early = await createTestClient(appRouter, {
        as: "manager",
        clock: new FakeClock("2020-01-01T00:00:00.000Z"),
      });
      await early.client.alerts.sweep();
      const told = await scratchDb().query.alert.findMany({
        where: { kind: "low_stock", userId: "test-manager" },
        columns: { entityId: true, params: true },
      });
      expect(
        told.filter((one) => one.entityId.startsWith(world.concentrate.id))
      ).toHaveLength(1);
      // A second sweep tells nobody twice.
      await early.client.alerts.sweep();
      const again = await scratchDb().query.alert.findMany({
        where: { kind: "low_stock", userId: "test-manager" },
        columns: { entityId: true },
      });
      expect(
        again.filter((one) => one.entityId.startsWith(world.concentrate.id))
      ).toHaveLength(1);
      // The Manager's inbox is every test file's: what this test raised in it goes at once, rather
      // than sitting at the top of a list another file is reading.
      await scratchDb()
        .delete(alert)
        .where(like(alert.entityId, `${world.concentrate.id}%`));

      // A lorry comes: above the threshold, off the queue.
      await manager.client.stock.receive({
        feedItemId: world.concentrate.id,
        kind: "purchase",
        quantity: 500,
        priceBdt: 20_000,
        seller: { name: `রহমান ফিডস ${suffix}` },
        receivedOn: "2035-01-11",
      });
      const restocked = await manager.client.home.manager();
      expect(
        restocked.queue.lowStock.map((line) => line.feedItemId)
      ).not.toContain(world.concentrate.id);
    } finally {
      // Every test file shares this farm and its Manager's digest: the threshold goes, and so do any
      // notices another file's sweep raised about it meanwhile.
      await manager.client.feed.setLowStock({
        feedItemId: world.concentrate.id,
        threshold: null,
      });
      await scratchDb()
        .delete(alert)
        .where(like(alert.entityId, `${world.concentrate.id}%`));
    }
  });
});
