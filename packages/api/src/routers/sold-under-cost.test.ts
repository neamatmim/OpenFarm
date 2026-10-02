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

// A Sale that fetched less than she cost the farm, or less than her weight at the market's low price a kilo, is told to
// the Owner in the evening's post. Never refused: a bull with a bad leg goes cheap, and the haat is the Manager's call.

const suffix = `sold-under-${Date.now()}`;
const WINDOW = {
  targetWindowStart: "2078-06-17",
  targetWindowEnd: "2078-06-19",
};
const SOLD = "2078-03-20T06:00:00.000Z";

let penId = "";

const as = (role: "owner" | "manager", instant = SOLD) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2078-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // What a kilo is fetching, as the Owner judges the market.
  await owner.client.fattening.setMarketPrice({
    lowBdtPerKg: 500,
    highBdtPerKg: 560,
  });
});

/** A bull bought for ৳1,00,000 and ৳1,000 of Hasil: he has cost ৳1,01,000 before he eats anything. */
const aBull = async (into = penId) => {
  const manager = await as("manager", "2078-03-02T04:00:00.000Z");
  return await manager.client.intake.record({
    penId: into,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    hasilBdt: 1000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2078-03-02T04:00:00.000Z"),
    ...WINDOW,
  });
};

const sell = async (
  tagNumber: string,
  priceBdt: number,
  {
    weightKg = 300,
    instant = SOLD,
  }: { weightKg?: number; instant?: string } = {}
) => {
  const manager = await as("manager", instant);
  await manager.client.sale.record({
    tagNumber,
    buyer: { name: `করিম ব্যাপারী ${suffix}`, phone: "+8801711000079" },
    // Three hundred kilos at the ৳500 low is ৳1,50,000.
    weightKg,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৭",
    driver: `চালক ${suffix}`,
    priceBdt,
  });
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true },
    with: { sale: { columns: { id: true } } },
  });
  return her?.sale?.id ?? "";
};

const toldOf = async (saleId: string) =>
  await scratchDb().query.alert.findMany({
    where: { kind: "sold_under_cost", entityId: saleId },
    columns: { userId: true, params: true },
  });

describe("a sale under her cost or the market", () => {
  it("is told to the Owner alone when she fetched less than she cost", async () => {
    const bull = await aBull();
    const saleId = await sell(bull.tagNumber, 90_000);
    expect(await toldOf(saleId)).toEqual([
      {
        userId: thePerson("owner").id,
        params: expect.objectContaining({
          tag: bull.tagNumber,
          priceBdt: 90_000,
          costBdt: 101_000,
          lowBdt: 150_000,
        }),
      },
    ]);
  });

  it("is told when she fetched her cost but less than her weight at the low price", async () => {
    const bull = await aBull();
    const saleId = await sell(bull.tagNumber, 140_000);
    expect(await toldOf(saleId)).toHaveLength(1);
  });

  it("tells nobody of a sale over both", async () => {
    const bull = await aBull();
    const saleId = await sell(bull.tagNumber, 160_000);
    expect(await toldOf(saleId)).toEqual([]);
  });

  it("is told when a Correction takes the price under", async () => {
    const bull = await aBull();
    const saleId = await sell(bull.tagNumber, 160_000);
    const manager = await as("manager", "2078-03-20T09:00:00.000Z");
    await manager.client.sale.correct({
      id: saleId,
      reason: `দাম ভুল লেখা হয়েছিল ${suffix}`,
      changes: { priceBdt: { from: 160_000, to: 95_000 } },
    });
    expect(await toldOf(saleId)).toHaveLength(1);
  });

  it("leaves the dairy side alone: a cow culled to a butcher was never going to fetch her working life back", async () => {
    const owner = await as("owner", "2078-03-01T04:00:00.000Z");
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
      source: "born",
      aliases: [],
    });
    const saleId = await sell(cow.tagNumber, 10_000);
    expect(await toldOf(saleId)).toEqual([]);
  });
});

/** The round that puts a bull on the scale. */
const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}` },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
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

describe("a sale floored on her last weighing", () => {
  const bulls = { scale: "", stale: "", flagged: "" };

  beforeAll(async () => {
    const owner = await as("owner", "2078-03-01T04:00:00.000Z");
    const shed = await owner.client.herd.createShed({ name: `ওজন ${suffix}` });
    const pen = await owner.client.herd.createPen({
      quarantine: true,
      shedId: shed.id,
      name: `ওজনের পেন ${suffix}`,
    });
    const weighing = await owner.client.sops.create({ content: weighInSop() });
    for (const key of Object.keys(bulls) as (keyof typeof bulls)[]) {
      // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
      const bull = await aBull(pen.id);
      bulls[key] = bull.tagNumber;
    }
    const weigh = async (instant: string, readings: [string, number][]) => {
      const manager = await as("manager", instant);
      await manager.client.instances.ensureDue();
      const today = await manager.client.instances.today({ penId: pen.id });
      const work = today.find(
        (row) => row.definitionId === weighing.definitionId
      );
      await manager.client.instances.claim({ id: work?.id ?? "" });
      for (const [animalTag, kg] of readings) {
        // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
        await manager.client.instances.completeStep({
          instanceId: work?.id ?? "",
          stepId: "weigh",
          animalTag,
          evidence: [kg],
        });
      }
    };
    // The flagged one weighed 300 kg on the sixth; a week later the scale said 400, more than a bull can put on.
    await weigh("2078-03-06T02:00:00.000Z", [[bulls.flagged, 300]]);
    await weigh("2078-03-13T02:00:00.000Z", [
      [bulls.scale, 400],
      [bulls.stale, 400],
      [bulls.flagged, 400],
    ]);
  });

  it("is told on her last weighing less the allowance, where the day's weight was typed lower", async () => {
    // 330 kg at ৳500 is ৳1,65,000, which ৳1,70,000 is over; 400 kg less 8% is 368 kg, ৳1,84,000, which it is under.
    const saleId = await sell(bulls.scale, 170_000, { weightKg: 330 });
    expect(await toldOf(saleId)).toEqual([
      {
        userId: thePerson("owner").id,
        params: expect.objectContaining({
          lowBdt: 184_000,
          floorKg: 368,
          floorFrom: "scale",
        }),
      },
    ]);
  });

  it("is worked on the day's weight where her weighing is thirty days old", async () => {
    const saleId = await sell(bulls.stale, 170_000, {
      weightKg: 330,
      instant: "2078-04-12T06:00:00.000Z",
    });
    expect(await toldOf(saleId)).toEqual([]);
  });

  it("passes over a weighing the farm doubted", async () => {
    // Her last trusted weighing is 300 kg: less 8%, lighter than the 330 kg typed.
    const saleId = await sell(bulls.flagged, 170_000, { weightKg: 330 });
    expect(await toldOf(saleId)).toEqual([]);
  });
});
