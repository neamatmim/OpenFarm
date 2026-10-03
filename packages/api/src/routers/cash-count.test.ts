import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// The weekly Cash Count: the Manager counts the cash in their own hand, blind, against what the farm says they hold;
// the count wins, and a shortfall past the Owner's line is told to the Owner.

const suffix = `cash-count-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let countId = "";
let manureId = "";

/** Half past six on a Friday evening at the farm. */
const fridayEvening = (day: string) => `${day}T12:30:00.000Z`;

beforeAll(async () => {
  const owner = await as("owner", "2071-05-01T04:00:00.000Z");
  const made = await owner.client.sops.create({
    content: standardPlaybook().cashCount,
  });
  countId = made.definitionId;
  // Work about the whole farm is raised while any Pen holds an animal.
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    shedId: shed.id,
    name: `বকনা পেন ${suffix}`,
  });
  await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const manager = await as("manager", "2071-05-01T04:00:00.000Z");
  const categories = await manager.client.money.categories();
  manureId = categories.find((one) => one.key === "manure_sales")?.id ?? "";
  // Ten thousand in the Manager's hand from the manure sold.
  await manager.client.money.enter({
    categoryId: manureId,
    amountMoney: 10_000,
    occurredOn: "2071-05-01",
    counterparty: { name: `গোবর ক্রেতা ${suffix}` },
    paymentMethod: "cash",
  });
});

const managersHand = async (instant: string) => {
  const owner = await as("owner", instant);
  const hands = await owner.client.cash.inHand();
  return hands.find((one) => one.userId === thePerson("manager").id);
};

/** The Manager's count on a Friday evening. */
const countOn = async (day: string, counted: number, note?: string) => {
  const manager = await as("manager", fridayEvening(day));
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today();
  const work = today.find((row) => row.definitionId === countId);
  if (!work) {
    throw new Error("expected the weekly cash count");
  }
  await manager.client.work.claim({ id: work.id });
  const done = await manager.client.work.completeStep({
    instanceId: work.id,
    stepId: "count",
    evidence: [counted, note ?? ""],
  });
  const completion = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId: work.id, stepId: "count" },
    columns: { id: true },
  });
  return { manager, done, completionId: completion?.id ?? "" };
};

const shortTold = async () =>
  await scratchDb().query.alert.findMany({
    where: { kind: "cash_short", userId: thePerson("owner").id },
    columns: { entityId: true, params: true },
  });

describe("the weekly cash count", () => {
  it("is blind, and a count that agrees changes nothing", async () => {
    const { done } = await countOn("2071-05-15", 10_000);
    expect(done.effect).toEqual({ kind: "cash_count", differs: false });
    expect(await managersHand(fridayEvening("2071-05-15"))).toMatchObject({
      amount: 10_000,
      lastCount: { counted: 10_000, expected: 10_000 },
    });
    expect(await shortTold()).toEqual([]);
  });

  it("wins: the hand holds what was counted, and the Owner is told of a shortfall past the line", async () => {
    const { done, completionId } = await countOn(
      "2071-05-22",
      8000,
      "দুই হাজার খরচ লেখা হয়নি"
    );
    expect(done.effect).toEqual({ kind: "cash_count", differs: true });
    expect(await managersHand(fridayEvening("2071-05-22"))).toMatchObject({
      amount: 8000,
    });
    const told = await shortTold();
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      entityId: completionId,
      params: { shortMoney: 2000, countedOn: "2071-05-22" },
    });
  });

  it("reads a Handover made just before it, and tells nothing within the line", async () => {
    const manager = await as("manager", "2071-05-29T11:00:00.000Z");
    await manager.client.cash.handOver({
      from: { userId: thePerson("manager").id },
      to: { userId: thePerson("owner").id },
      amountMoney: 3000,
    });
    // Five thousand left, and 4,500 found: short 500, under the Owner's ৳1,000.
    await countOn("2071-05-29", 4500);
    expect(await managersHand(fridayEvening("2071-05-29"))).toMatchObject({
      amount: 4500,
      lastCount: { counted: 4500, expected: 5000 },
    });
    expect(await shortTold()).toHaveLength(1);
  });

  it("compares afresh when counted again by a Correction", async () => {
    const { manager, completionId } = await countOn("2071-06-05", 4000);
    await correctStepAsShown(manager.client, {
      completionId,
      reason: "আবার গুনে সাড়ে চার হাজারই পাওয়া গেছে",
      evidence: [4500, ""],
    });
    const row = await scratchDb().query.cashCount.findFirst({
      where: { completionId },
      columns: { counted: true, expected: true },
    });
    expect(row).toEqual({ counted: 4500, expected: 4500 });
  });

  it("is the Owner's line to move, not the Manager's", async () => {
    const manager = await as("manager", fridayEvening("2071-06-05"));
    await expect(
      manager.client.farm.setParameters({ cashShortTellMoney: 50_000 })
    ).rejects.toThrow("Owner");
  });
});
