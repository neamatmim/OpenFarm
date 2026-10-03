import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Shrink: what a bull weighed last on the farm — his last Weigh-in, or what he came in at — against the scale he was
// sold on. Shown, never refused.

const suffix = `shrink-${Date.now()}`;
const WINDOW = {
  targetWindowStart: "2079-06-17",
  targetWindowEnd: "2079-06-19",
};
const SOLD = "2079-03-18T06:00:00.000Z";

const as = (role: "owner" | "manager", instant = SOLD) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** The fattening side's round, unless another is named. */
const FATTENING: SopContent["appliesTo"] = {
  side: "fattening",
  states: ["quarantine", "fattening"],
};

const weighInSop = (appliesTo = FATTENING): SopContent => ({
  name: { bn: `ওজন ${suffix} ${appliesTo.side}` },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo,
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

let penId = "";
let weighed = "";
let unweighed = "";

const aBull = async (weightKg: number, into = penId) => {
  const manager = await as("manager", "2079-03-02T04:00:00.000Z");
  const bull = await manager.client.intake.record({
    penId: into,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 90_000,
    weightKg,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2079-03-02T04:00:00.000Z"),
    ...WINDOW,
  });
  return bull.tagNumber;
};

beforeAll(async () => {
  const owner = await as("owner", "2079-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  weighed = await aBull(250);
  unweighed = await aBull(260);
  // The first on the scale on the tenth: 320 kg. The second never weighed again after the lorry he came on.
  const manager = await as("manager", "2079-03-10T02:00:00.000Z");
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  const work = today.find((row) => row.definitionId === weighing.definitionId);
  await manager.client.instances.claim({ id: work?.id ?? "" });
  await manager.client.instances.completeStep({
    instanceId: work?.id ?? "",
    stepId: "weigh",
    animalTag: weighed,
    evidence: [320],
  });
  // One lorry, both on it, both sold at the livestock market.
  const selling = await as("manager");
  await selling.client.sellingTrips.record({
    wentTo: `ঈদের হাট ${suffix}`,
    transportMoney: 4000,
    keepMoney: 0,
    animals: [weighed, unweighed],
    wentOn: new Date(SOLD),
    paymentMethod: "cash",
  });
  for (const [tagNumber, weightKg] of [
    [weighed, 300],
    [unweighed, 250],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after the other off the lorry
    await selling.client.sale.record({
      tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceMoney: 150_000,
      weightKg,
      destination: `গাবতলী ${suffix}`,
      vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৭",
      driver: `চালক ${suffix}`,
      soldAt: new Date(SOLD),
    });
  }
});

const soldToday = async () => {
  const manager = await as("manager");
  return await manager.client.papers.day({ day: "2079-03-18" });
};

describe("shrink at sale", () => {
  it("is read against her last Weigh-in, or else what she came in at", async () => {
    const day = await soldToday();
    expect(day.find((one) => one.tagNumber === weighed)?.shrink).toEqual({
      lastKg: 320,
      lostKg: 20,
      percent: 6.3,
      days: 8,
      stale: false,
    });
    expect(day.find((one) => one.tagNumber === unweighed)?.shrink).toEqual({
      lastKg: 260,
      lostKg: 10,
      percent: 3.8,
      days: 16,
      stale: false,
    });
  });

  it("is told for the lorry they went on together, weighed by weight", async () => {
    const manager = await as("manager");
    const trips = await manager.client.sellingTrips.list();
    expect(
      trips.find((one) => one.wentTo === `ঈদের হাট ${suffix}`)?.shrink
    ).toEqual({ lostKg: 30, percent: 5.2, animals: 2 });
  });

  it("gives the sale sheet her last weighing, whoever she is", async () => {
    const manager = await as("manager", "2079-03-12T06:00:00.000Z");
    const last = await manager.client.sale.lastWeighed({ tagNumber: weighed });
    expect(last).toEqual({
      kg: 320,
      at: new Date("2079-03-10T02:00:00.000Z"),
    });
  });

  it("moves when the sale's weight is put right", async () => {
    const manager = await as("manager", "2079-03-18T09:00:00.000Z");
    const before = await soldToday();
    const sold = before.find((one) => one.tagNumber === weighed);
    await manager.client.sale.correct({
      id: sold?.id ?? "",
      reason: `পাল্লা ভুল পড়া হয়েছিল ${suffix}`,
      changes: { weightKg: { from: 300, to: 310 } },
    });
    const after = await soldToday();
    expect(after.find((one) => one.tagNumber === weighed)).toMatchObject({
      weightKg: 310,
      shrink: { lostKg: 10 },
    });
  });
});

describe("shrink past the farm's allowance", () => {
  const bulls = { twelve: "", five: "", stale: "", cow: "" };
  const saleOf = new Map<string, string>();

  const sold = async (tagNumber: string, weightKg: number, instant = SOLD) => {
    const manager = await as("manager", instant);
    await manager.client.sale.record({
      tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceMoney: 150_000,
      weightKg,
      destination: `গাবতলী ${suffix}`,
      vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৭",
      driver: `চালক ${suffix}`,
    });
    // This file's farm's: every test farm has its own F-0003.
    const her = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber },
      columns: { id: true },
      with: { sale: { columns: { id: true } } },
    });
    saleOf.set(tagNumber, her?.sale?.id ?? "");
  };

  const toldOf = async (tagNumber: string) =>
    await scratchDb().query.alert.findMany({
      where: { kind: "large_shrink", entityId: saleOf.get(tagNumber) ?? "" },
      columns: { userId: true, params: true },
    });

  beforeAll(async () => {
    const owner = await as("owner", "2079-03-01T04:00:00.000Z");
    const shed = await owner.client.herd.createShed({ name: `বড় ${suffix}` });
    const pen = await owner.client.herd.createPen({
      quarantine: true,
      shedId: shed.id,
      name: `বড় পেন ${suffix}`,
    });
    const fattening = await owner.client.sops.create({ content: weighInSop() });
    const dairy = await owner.client.sops.create({
      content: weighInSop({ side: "dairy", states: ["heifer"] }),
    });
    bulls.twelve = await aBull(380, pen.id);
    bulls.five = await aBull(380, pen.id);
    bulls.stale = await aBull(380, pen.id);
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    bulls.cow = cow.tagNumber;
    // All four on the scale on the tenth at 400 kg.
    const manager = await as("manager", "2079-03-10T02:00:00.000Z");
    await manager.client.instances.ensureDue();
    const today = await manager.client.instances.today({ penId: pen.id });
    for (const [definitionId, tags] of [
      [fattening.definitionId, [bulls.twelve, bulls.five, bulls.stale]],
      [dairy.definitionId, [bulls.cow]],
    ] as const) {
      const work = today.find((row) => row.definitionId === definitionId);
      // oxlint-disable-next-line no-await-in-loop -- one round, then the other
      await manager.client.instances.claim({ id: work?.id ?? "" });
      for (const animalTag of tags) {
        // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
        await manager.client.instances.completeStep({
          instanceId: work?.id ?? "",
          stepId: "weigh",
          animalTag,
          evidence: [400],
        });
      }
    }
    await sold(bulls.twelve, 352);
    await sold(bulls.five, 380);
    // Twenty-six days after he was weighed: past what the farm trusts a weighing for.
    await sold(bulls.stale, 352, "2079-04-05T06:00:00.000Z");
    await sold(bulls.cow, 352);
  });

  it("is told to the Owner once, with the kilos either side", async () => {
    expect(await toldOf(bulls.twelve)).toEqual([
      {
        userId: thePerson("owner").id,
        params: expect.objectContaining({
          tag: bulls.twelve,
          lastKg: 400,
          lastOn: "2079-03-10",
          saleKg: 352,
          percent: 12,
        }),
      },
    ]);
    // Put right, still a sale that shrank too much: told once.
    const manager = await as("manager", "2079-03-18T09:00:00.000Z");
    await manager.client.sale.correct({
      id: saleOf.get(bulls.twelve) ?? "",
      reason: `দাম ভুল ${suffix}`,
      changes: { weightKg: { from: 352, to: 350 } },
    });
    expect(await toldOf(bulls.twelve)).toHaveLength(1);
  });

  it("is not told within the allowance, on a stale weighing, or for a cow", async () => {
    expect(await toldOf(bulls.five)).toEqual([]);
    expect(await toldOf(bulls.stale)).toEqual([]);
    expect(await toldOf(bulls.cow)).toEqual([]);
  });

  it("is the Owner's allowance to move, not the Manager's", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.farm.setParameters({ shrinkTellPercent: 12 })
    ).rejects.toThrow("Owner");
  });
});
