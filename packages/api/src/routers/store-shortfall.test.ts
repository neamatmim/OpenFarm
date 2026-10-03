import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// What a Stock Count finds missing, in taka at the store's price when counted: shown beside each difference, added up
// for a period beside the Overheads, and told once to the Owner and the Manager when a count is short by more than the
// Owner's line.

const suffix = `short-${Date.now()}`;

/** A count raised by hand, nobody checking: this file is about what the count is worth, not when it comes. */
const countSop = (): SopContent => ({
  name: { bn: `গুদাম গণনা ${suffix}` },
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

let penId = "";
let countId = "";
let bran = "";
let napier = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2057-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গুদাম ${suffix}`,
  });
  penId = pen.id;
  const branItem = await owner.client.feed.items.create({
    name: { bn: `ভুসি ${suffix}` },
  });
  const napierItem = await owner.client.feed.items.create({
    name: { bn: `নেপিয়ার ${suffix}` },
  });
  bran = branItem.id;
  napier = napierItem.id;
  // ৳40 a kilo, and the farm's own grass at no price.
  await owner.client.stock.receive({
    feedItemId: bran,
    kind: "purchase",
    quantity: 1000,
    priceMoney: 40_000,
    seller: { name: `রহমান ফিডস ${suffix}` },
    receivedOn: "2057-01-01",
  });
  await owner.client.stock.receive({
    feedItemId: napier,
    kind: "harvest",
    quantity: 500,
    receivedOn: "2057-01-01",
  });
  const sop = await owner.client.sops.create({ content: countSop() });
  countId = sop.definitionId;
});

/** A count on a morning: what the store is thought to hold is counted as it stands unless `found` says otherwise. */
const countOn = async (
  day: string,
  found: Record<string, { counted: number; reason: string }>
) => {
  const manager = await as("manager", `${day}T04:00:00.000Z`);
  await manager.client.work.raiseNow({ definitionId: countId, penId });
  const today = await manager.client.work.today({ penId });
  const work = today.find(
    (row) => row.definitionId === countId && row.state === "due"
  );
  const id = work?.id ?? "";
  await manager.client.work.claim({ id });
  const board = await manager.client.work.get({ id });
  const stock = await manager.client.stock.onHand();
  await manager.client.work.completeStep({
    instanceId: id,
    stepId: "count",
    evidence: [true],
    counts: (board.stockCount?.items ?? []).map((item) => {
      const onHand =
        stock.find((line) => line.feedItemId === item.feedItemId)?.onHand ?? 0;
      return {
        feedItemId: item.feedItemId,
        ...(found[item.feedItemId] ?? { counted: Math.max(0, onHand) }),
      };
    }),
  });
  const done = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId: id, stepId: "count" },
    columns: { id: true },
  });
  return { manager, completionId: done?.id ?? "" };
};

const toldOf = async (completionId: string, role: "owner" | "manager") => {
  const rows = await scratchDb().query.alert.findMany({
    where: {
      kind: "store_shortfall",
      userId: thePerson(role).id,
      entityId: completionId,
    },
    columns: { params: true },
  });
  return rows.map((row) => row.params);
};

describe("a count come up short", () => {
  it("is priced at the store's average price, and told to the Owner and the Manager past the line", async () => {
    const { manager, completionId } = await countOn("2057-01-05", {
      [bran]: { counted: 900, reason: "বস্তা কম পাওয়া গেছে" },
      [napier]: { counted: 400, reason: "শুকিয়ে কমেছে" },
    });

    const lines = await manager.client.stock.adjustments({});
    const branLine = lines.find(
      (line) => line.completionId === completionId && line.feedItemId === bran
    );
    expect(branLine).toMatchObject({
      difference: -100,
      priceMoney: 40,
      valueMoney: -4000,
    });
    // The farm's own grass was never bought: no price, and nothing in taka.
    const napierLine = lines.find(
      (line) => line.completionId === completionId && line.feedItemId === napier
    );
    expect(napierLine).toMatchObject({ priceMoney: null, valueMoney: null });

    expect(await toldOf(completionId, "owner")).toEqual([
      { shortMoney: 4000, countedOn: "2057-01-05" },
    ]);
    expect(await toldOf(completionId, "manager")).toHaveLength(1);
  });

  it("is told once, however the count is put right", async () => {
    const { completionId } = await countOn("2057-01-12", {
      [bran]: { counted: 800, reason: "ইঁদুরে কেটেছে" },
    });
    expect(await toldOf(completionId, "owner")).toHaveLength(1);

    const again = await as("manager", "2057-01-12T06:00:00.000Z");
    await correctStepAsShown(again.client, {
      completionId,
      reason: "আবার গোনা হলো",
      evidence: [true],
      counts: [
        { feedItemId: bran, counted: 700, reason: "ইঁদুরে কেটেছে" },
        { feedItemId: napier, counted: 400 },
      ],
    });
    expect(await toldOf(completionId, "owner")).toHaveLength(1);
  });

  it("is not told under the Owner's line, nor for feed found over", async () => {
    const under = await countOn("2057-01-19", {
      [bran]: { counted: 680, reason: "সামান্য কম" },
    });
    expect(await toldOf(under.completionId, "owner")).toHaveLength(0);

    const over = await countOn("2057-01-26", {
      [bran]: { counted: 900, reason: "আগমন লেখা বাকি ছিল" },
    });
    expect(await toldOf(over.completionId, "owner")).toHaveLength(0);
  });
});

describe("a count read again", () => {
  it("is worth what it reads now: feed written up late but dated before the count moves its taka", async () => {
    const { manager, completionId } = await countOn("2057-02-09", {
      [bran]: { counted: 500, reason: "বস্তা কম পাওয়া গেছে" },
    });
    const worth = async () => {
      const lines = await manager.client.stock.adjustments({
        feedItemId: bran,
      });
      return lines.find((line) => line.completionId === completionId)
        ?.valueMoney;
    };
    const before = await worth();
    // A delivery the store had that day, written up only afterwards: the count was shorter than it looked.
    const owner = await as("owner", "2057-02-10T04:00:00.000Z");
    await owner.client.stock.receive({
      feedItemId: bran,
      kind: "purchase",
      quantity: 100,
      priceMoney: 4000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2057-02-08",
    });
    expect(await worth()).toBeLessThan(before ?? 0);
  });
});

describe("a period's shortfall", () => {
  it("stands beside the Overheads, short and over kept apart", async () => {
    const owner = await as("owner", "2057-02-01T04:00:00.000Z");
    const report = await owner.client.costs.bySide({
      from: "2057-01-01",
      to: "2057-01-31",
    });
    expect(report.storeShortfall.counts).toBe(4);
    expect(report.storeShortfall.shortMoney).toBeGreaterThan(0);
    expect(report.storeShortfall.overMoney).toBeGreaterThan(0);
  });
});

describe("the Owner's line", () => {
  it("is the Owner's to move, not the Manager's", async () => {
    const manager = await as("manager", "2057-02-02T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ storeShortfallTellMoney: 100 })
    ).rejects.toThrow("Owner");
    const owner = await as("owner", "2057-02-02T04:00:00.000Z");
    await owner.client.farm.setParameters({ storeShortfallTellMoney: 5000 });
    const farm = await scratchDb().query.farm.findFirst({
      where: { id: theFarm().id },
      columns: { storeShortfallTellMoney: true },
    });
    expect(farm?.storeShortfallTellMoney).toBe(5000);
  });
});
