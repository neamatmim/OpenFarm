import { like } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
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
  const { and, eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
  // Nothing this file raised is left open for a later file's clock to find late.
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.sop.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
});

type Manager = Awaited<ReturnType<typeof createTestClient<typeof appRouter>>>;

const managerAt = (at: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(at) });

const lineFor = async (at: string, feedItemId: string) => {
  const manager = await managerAt(at);
  const stock = await manager.client.stock.onHand();
  return stock.find((line) => line.feedItemId === feedItemId);
};

/** This week's count, raised by hand on `day`, claimed by the Manager unless asked not to. */
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

/**
 * The count lines for everything on the board. A count counts every Feed Item the farm keeps, and this file keeps
 * more than the one each test is about: the rest are counted at what the store holds, which changes nothing
 * and needs no reason — or, for one left below nothing, at nothing, which is what a store below
 * nothing really holds, with the reason that says so. A Correction repeats what the count said about
 * them.
 */
const countLines = async (
  manager: Manager,
  workId: string,
  mine: Record<string, { counted: number; reason?: string }>
) => {
  const board = await manager.client.instances.get({ id: workId });
  const stock = await manager.client.stock.onHand();
  return (board.stockCount?.items ?? []).map((item) => {
    const onHand =
      stock.find((line) => line.feedItemId === item.feedItemId)?.onHand ?? 0;
    // A Correction says again what the count said about everything it is not putting right.
    const before = board.stockCount?.counted.find(
      (line) => line.feedItemId === item.feedItemId
    );
    const counted = before?.counted ?? Math.max(0, onHand);
    const theirs =
      before?.reason || onHand < 0
        ? {
            counted,
            reason: before?.reason ?? "খাতায় যা লেখা হয়নি তা খাওয়ানো হয়েছিল",
          }
        : { counted };
    return {
      feedItemId: item.feedItemId,
      ...(mine[item.feedItemId] ?? theirs),
    };
  });
};

/** Raises, counts and finishes a count on `day`. */
const countOn = async (
  day: string,
  mine: Record<string, { counted: number; reason?: string }>
) => {
  const { id, manager } = await countWork(day);
  await manager.client.instances.completeStep({
    instanceId: id,
    stepId: "count",
    evidence: [true],
    counts: await countLines(manager, id, mine),
  });
  await manager.client.instances.complete({ id });
  return id;
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

    // A count that leaves the straw out has a hole the store would read straight through: refused.
    await expect(
      manager.client.instances.completeStep({
        instanceId: id,
        stepId: "count",
        evidence: [true],
        counts: [
          {
            feedItemId: world.concentrate.id,
            counted: 950,
            reason: "ইঁদুরে কেটেছে",
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        refusal: "count_incomplete",
        feedItemIds: expect.arrayContaining([world.grass.id]),
      },
    });

    // Fifty kilos short, and nobody says why: refused, naming it.
    await expect(
      manager.client.instances.completeStep({
        instanceId: id,
        stepId: "count",
        evidence: [true],
        counts: await countLines(manager, id, {
          [world.concentrate.id]: { counted: 950 },
          [world.grass.id]: { counted: 500 },
        }),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        refusal: "difference_needs_reason",
        feedItemIds: [world.concentrate.id],
      },
    });

    await manager.client.instances.completeStep({
      instanceId: id,
      stepId: "count",
      evidence: [true],
      counts: await countLines(manager, id, {
        [world.concentrate.id]: { counted: 950, reason: "ইঁদুরে কেটেছে" },
        [world.grass.id]: { counted: 500 },
      }),
    });
    await manager.client.instances.complete({ id });

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
      {
        expected: 1000,
        counted: 950,
        difference: -50,
        reason: "ইঁদুরে কেটেছে",
        countedByName: expect.any(String),
      },
    ]);
    // A line that matched is no adjustment at all.
    const grassAdjustments = await manager.client.stock.adjustments({
      feedItemId: world.grass.id,
    });
    expect(grassAdjustments).toEqual([]);
  });

  it("reads its difference again when something dated before it is written up late", async () => {
    // Fifty kilos of the farm's own maize went into the store on the 7th, and nobody wrote it down
    // until the 9th. The count on the 8th was not fifty short, then: it was a hundred.
    const manager = await managerAt("2035-01-09T03:00:00.000Z");
    await manager.client.stock.receive({
      feedItemId: world.concentrate.id,
      kind: "harvest",
      quantity: 50,
      receivedOn: "2035-01-07",
    });
    const [adjustment] = await manager.client.stock.adjustments({
      feedItemId: world.concentrate.id,
    });
    expect(adjustment).toMatchObject({
      expected: 1050,
      expectedWhenCounted: 1000,
      counted: 950,
      difference: -100,
    });
    // And the store still reads the count: what was there on the 8th was 950.
    const concentrate = await lineFor(
      "2035-01-09T03:30:00.000Z",
      world.concentrate.id
    );
    expect(concentrate?.onHand).toBe(950);
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
    const countedOn = await scratchDb().query.stepCompletion.findFirst({
      where: { id: booked?.completionId ?? "" },
      columns: { instanceId: true },
    });
    await correctStepAsShown(manager.client, {
      completionId: booked?.completionId ?? "",
      evidence: [true],
      counts: await countLines(manager, countedOn?.instanceId ?? "", {
        [world.concentrate.id]: {
          counted: 900,
          reason: "ইঁদুরে কেটেছে, আবার গোনা",
        },
        [world.grass.id]: { counted: 500 },
      }),
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
    // One adjustment, against the store as it now reads for the 8th: 1050 expected, 900 counted.
    expect(adjustments).toMatchObject([{ counted: 900, difference: -150 }]);
  });

  it("is the Owner's to make as the Manager's is", async () => {
    // Unclaimed, so nothing but the count's own rule stands between the Owner and the Step. Counted as the store
    // stands, so nothing moves for the tests after it.
    const { id, manager } = await countWork("2035-01-10", { claim: false });
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2035-01-10T04:30:00.000Z"),
    });
    await expect(
      owner.client.instances.completeStep({
        instanceId: id,
        stepId: "count",
        evidence: [true],
        counts: await countLines(manager, id, {}),
      })
    ).resolves.toMatchObject({ effect: { kind: "stock_count" } });
  });
});

describe("running low", () => {
  it("puts a Feed Item below its level in front of the Manager and the Owner, and tells the Manager each time it runs low", async () => {
    const manager = await managerAt("2035-01-11T04:00:00.000Z");
    // Concentrate at 1000 kg, and the farm wants to hear below 1200.
    await manager.client.feed.setLowStock({
      feedItemId: world.concentrate.id,
      threshold: 1200,
    });
    // A sweep tells the Manager about everything late by then, so it is run before this file's own counts.
    const early = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2035-01-01T00:00:00.000Z"),
    });
    const toldAbout = async () => {
      const told = await scratchDb().query.alert.findMany({
        where: { kind: "low_stock", userId: thePerson("manager").id },
        columns: { params: true },
      });
      return told.filter(
        (one) =>
          (one.params as { feedItemId?: string }).feedItemId ===
          world.concentrate.id
      ).length;
    };
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

      // The Manager is told, in the digest and not by a buzz — and a second sweep tells nobody twice.
      await early.client.alerts.sweep();
      expect(await toldAbout()).toBe(1);
      await early.client.alerts.sweep();
      expect(await toldAbout()).toBe(1);

      // A count finds more than was thought and lifts it above the level; a later count finds it back
      // below. No lorry came in between, and it has run low again: a new thing to tell.
      await countOn("2035-01-12", {
        [world.concentrate.id]: { counted: 1300, reason: "আগের গোনা ভুল" },
      });
      await countOn("2035-01-13", {
        [world.concentrate.id]: { counted: 900, reason: "বেশি খাওয়ানো হয়েছে" },
      });
      await early.client.alerts.sweep();
      expect(await toldAbout()).toBe(2);

      // A lorry comes: above the level, off the queue.
      const restocking = await managerAt("2035-01-14T04:00:00.000Z");
      await restocking.client.stock.receive({
        feedItemId: world.concentrate.id,
        kind: "purchase",
        quantity: 500,
        priceBdt: 20_000,
        seller: { name: `রহমান ফিডস ${suffix}` },
        receivedOn: "2035-01-14",
      });
      const restocked = await restocking.client.home.manager();
      expect(
        restocked.queue.lowStock.map((line) => line.feedItemId)
      ).not.toContain(world.concentrate.id);
    } finally {
      // The level goes back, so the rest of this file's tests read a store nobody is worried about.
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

describe("a count from a phone's Outbox", () => {
  // The pen board sends every new Step through the Outbox, signal or none, so this is how a count
  // actually reaches the farm.
  it("is taken with its lines, as it is when sent on its own", async () => {
    const { id, manager } = await countWork("2035-01-20");
    const counts = await countLines(manager, id, {});

    const sent = await manager.client.sync.batch({
      key: `stock-count-${suffix}`,
      entries: [
        {
          id: `stock-count-entry-${suffix}`,
          seq: 1,
          kind: "step_completion",
          instanceId: id,
          stepId: "count",
          evidence: [true],
          counts,
          recordedAt: new Date("2035-01-20T04:10:00.000Z"),
        },
      ],
    });

    expect(sent.results).toMatchObject([{ outcome: "applied" }]);
    const board = await manager.client.instances.get({ id });
    expect(
      board.stockCount?.counted.map((line) => line.feedItemId).toSorted()
    ).toEqual(counts.map((line) => line.feedItemId).toSorted());
    await manager.client.instances.complete({ id });
  });
});
