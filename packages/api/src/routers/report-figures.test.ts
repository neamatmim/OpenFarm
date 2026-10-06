import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Every taka the farm spends is in some figure, and in the same one wherever it is shown: a Vet's visit that named no
// animal reached none, and is an Overhead; an animal lost costs the farm what she had cost her owner, which for a
// Venture's is what the Farm made good.

const suffix = `figures-${Date.now()}`;
const NOT_FOUND = "পশু পাওয়া যায়নি";

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}`, en: "Weigh-in" },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
  checkerRole: "manager",
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
let weighId = "";
let roundId = "";
let ventureId = "";

beforeAll(async () => {
  const owner = await as("owner", "2073-03-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // The crush is in this Pen, so the person reading the scale has to be assigned to it.
  await as("staff", "2073-03-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  ({ definitionId: weighId } = await owner.client.sops.create({
    content: weighInSop(),
  }));
  ({ definitionId: roundId } = await owner.client.sops.create({
    content: standardPlaybook().healthRound,
  }));
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2073-03-02",
    unitPriceMoney: 50_000,
    units: 20,
    targetWindowStart: "2073-06-17",
    targetWindowEnd: "2073-06-19",
  });
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 20, unitPriceMoney: 50_000 },
    `venture ${suffix}`,
    "2073-03-01"
  );
  await owner.client.ventures.startBuying({ id: venture.id });
  ventureId = venture.id;
});

/** The morning's weigh-in, read off the crush. */
const weigh = async (day: string, tagNumber: string, kg: number) => {
  const scheduler = await as("owner", `${day}T07:30:00.000Z`);
  await scheduler.client.work.ensureDue();
  const today = await scheduler.client.work.today({ penId });
  const instance = today.find((one) => one.definitionId === weighId);
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const staff = await as("staff", `${day}T07:30:00.000Z`);
  await staff.client.work.claim({ id: instance.id });
  await staff.client.work.completeStep({
    instanceId: instance.id,
    stepId: "weigh",
    animalTag: tagNumber,
    evidence: [kg],
  });
};

/** The round on a morning cannot find him. */
const notFoundOn = async (day: string, tagNumber: string) => {
  const manager = await as("manager", `${day}T02:30:00.000Z`);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const work = today.find((row) => row.definitionId === roundId);
  if (!work) {
    throw new Error("expected the round");
  }
  await manager.client.work.claim({ id: work.id });
  await manager.client.work.completeStep({
    instanceId: work.id,
    stepId: "look",
    animalTag: tagNumber,
    evidence: [],
    skipReason: NOT_FOUND,
  });
};

describe("a Vet's fee for a visit that named no animal", () => {
  it("is an Overhead, not a taka lost from every figure", async () => {
    const vet = await as("vet", "2072-05-20T04:00:00.000Z");
    const owner = await as("owner", "2072-06-01T04:00:00.000Z");
    const before = await owner.client.costs.bySide({
      from: "2072-05-01",
      to: "2072-05-31",
    });
    await vet.client.money.vetFee({
      amountMoney: 3000,
      visitedOn: "2072-05-20",
      paymentMethod: "cash",
    });
    const after = await owner.client.costs.bySide({
      from: "2072-05-01",
      to: "2072-05-31",
    });
    expect(after.overheads.totalMoney - before.overheads.totalMoney).toBe(3000);
  });
});

describe("what an animal lost cost the farm", () => {
  it("is what the Farm made good for a Venture's, not her whole life's cost across owners", async () => {
    // The Farm's own bull, ৳60,000 off the lorry, sold across to the Venture at ৳63,000 a week on.
    const manager = await as("manager", "2073-03-03T05:00:00.000Z");
    const bull = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2073-03-03T05:00:00.000Z"),
      targetWindowStart: "2073-06-17",
      targetWindowEnd: "2073-06-19",
    });
    await weigh("2073-03-09", bull.tagNumber, 252);
    const owner = await as("owner", "2073-03-10T04:00:00.000Z");
    await owner.client.ventures.sellInternally({
      tagNumber: bull.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 250,
      note: `দর ${suffix}`,
      soldOn: "2073-03-10",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceMoney: 63_000,
    });

    // The round cannot find him, and a week on the Owner writes him off, making the Venture good.
    await notFoundOn("2073-03-11", bull.tagNumber);
    const writing = await as("owner", "2073-03-19T06:00:00.000Z");
    const before = await writing.client.overview.get();
    const made = await writing.client.animals.madeGoodAmount({
      tagNumber: bull.tagNumber,
    });
    const amountMoney = made?.amountMoney ?? 0;
    await writing.client.animals.writeOff({
      tagNumber: bull.tagNumber,
      cause: "জানা নেই",
      madeGood: { reference: `MG-${suffix}` },
    });
    const after = await writing.client.overview.get();

    // The Farm paid the Venture what he had cost it, and that is what the farm lost on him — not the ৳60,000 the Farm
    // once paid for him, which the Venture's ৳63,000 had already paid back.
    expect(amountMoney).toBeGreaterThanOrEqual(63_000);
    expect(
      after.tiles.lostYear.costMoney - before.tiles.lostYear.costMoney
    ).toBe(amountMoney);
  });
});
