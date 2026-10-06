import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Withdrawal holds the right animal for the right time: whatever else the Vet has said of her, whatever the Drug
// List says now, and whatever the phone's clock said when the dose went in.

const treatmentSop = (): SopContent => ({
  name: { bn: "চিকিৎসা — ডোজ দিন", en: "Treatment — give the dose" },
  purpose: { bn: "ভেটের লেখা ডোজ পশুকে দিন এবং লিখে রাখুন" },
  triggers: [{ kind: "prescription" }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "dose",
      text: { bn: "ডোজ দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "ওষুধ শেষ" }],
      effect: { kind: "treatment" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  const shed = await owner.client.sheds.create({
    name: `withdrawal-holds-${Date.now()}`,
  });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: "আটকে রাখার পেন",
  });
  await owner.client.sops.create({ content: treatmentSop() });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-withdrawal-holds-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const product = async (name: string, milk: number, meat: number) =>
    await vet.client.drugs.create({
      name: { bn: `${name} ${Date.now()}`, en: name },
      milkWithdrawalDays: milk,
      meatWithdrawalDays: meat,
    });
  return {
    pen,
    long: await product("দীর্ঘ", 20, 28),
    short: await product("স্বল্প", 2, 7),
    label: await product("লেবেল", 3, 3),
    slow: await product("ধীর", 2, 45),
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** A heifer on a course of a product, and the clients that act on her. */
const onACourse = async (clock: FakeClock, productId: string, days = 1) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const heifer = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
  const diagnosis = await vet.client.diagnoses.record({
    animalTag: heifer.tagNumber,
    disease: { bn: "জ্বর", en: "Fever" },
  });
  await vet.client.prescriptions.prescribe({
    animalTag: heifer.tagNumber,
    diagnosisId: diagnosis.id,
    productId,
    dose: "১০ মিলি",
    route: "intramuscular",
    times: ["08:00"],
    days,
  });
  return { heifer, owner, vet };
};

const doseOf = async (clock: FakeClock, tagNumber: string, number: number) => {
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const [course] = await vet.client.prescriptions.forAnimal({ tagNumber });
  const dose = course?.doses.find((one) => one.number === number);
  if (!dose) {
    throw new Error(`expected dose ${number} of her course`);
  }
  return dose;
};

const giveDose = async (
  clock: FakeClock,
  tagNumber: string,
  number: number
) => {
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  const dose = await doseOf(clock, tagNumber, number);
  await staff.client.work.claim({ id: dose.instanceId });
  await staff.client.work.completeStep({
    instanceId: dose.instanceId,
    stepId: "dose",
    evidence: [true],
  });
  const loaded = await staff.client.work.get({ id: dose.instanceId });
  const completion = loaded.completions.find((row) => row.stepId === "dose");
  if (!completion) {
    throw new Error("expected the dose recorded");
  }
  return { completionId: completion.id };
};

describe("a hold the Vet shortened", () => {
  it("still holds her for a dose given after it, though that dose ends sooner than the one shortened", async () => {
    const clock = new FakeClock("2032-10-01T02:00:00.000Z");
    const { heifer, owner, vet } = await onACourse(clock, world.long.id);
    await giveDose(clock, heifer.tagNumber, 1);

    // Five days on, the Vet frees her meat from the long product the next day.
    clock.advance(5 * DAY);
    await vet.client.withdrawals.shorten({
      animalTag: heifer.tagNumber,
      meatUntil: new Date(clock.now().getTime() + DAY),
      reason: "রক্ত পরীক্ষায় ওষুধ নেই",
    });
    // Then he is given a short product, not prescribed: seven days on her meat from now.
    await owner.client.treatments.giveNotPrescribed({
      animalTag: heifer.tagNumber,
      productId: world.short.id,
      advice: "জ্বর, ফার্মেসির পরামর্শে",
    });

    const her = await owner.client.animals.get({ tagNumber: heifer.tagNumber });
    expect(her.meatWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 7 * DAY)
    );
  });

  it("stands when a dose it covered is corrected to a skip", async () => {
    const clock = new FakeClock("2032-10-08T02:00:00.000Z");
    const { heifer, owner, vet } = await onACourse(clock, world.long.id, 2);
    await giveDose(clock, heifer.tagNumber, 1);
    clock.advance(DAY);
    const second = await giveDose(clock, heifer.tagNumber, 2);
    const shortenedTo = new Date(clock.now().getTime() + 2 * DAY);
    await vet.client.withdrawals.shorten({
      animalTag: heifer.tagNumber,
      meatUntil: shortenedTo,
      reason: "রক্ত পরীক্ষায় ওষুধ নেই",
    });

    // The second dose never went in: the bottle was empty.
    await owner.client.work.correctStep({
      id: second.completionId,
      reason: "দ্বিতীয় ডোজ দেওয়া হয়নি",
      changes: {
        answer: {
          from: {
            skipReason: null,
            evidence: [true],
            destination: null,
            outOfRange: null,
          },
          to: { skipReason: "ওষুধ শেষ", evidence: [] },
        },
      },
    });

    const her = await owner.client.animals.get({ tagNumber: heifer.tagNumber });
    expect(her.meatWithdrawalUntil).toEqual(shortenedTo);
    expect(her.shortened?.reason).toBe("রক্ত পরীক্ষায় ওষুধ নেই");
  });
});

describe("a product's days, changed on the Drug List", () => {
  it("hold every animal already dosed when they are raised, and only new doses when they are lowered", async () => {
    const clock = new FakeClock("2032-10-15T02:00:00.000Z");
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const first = await onACourse(clock, world.label.id);
    const second = await onACourse(clock, world.label.id);
    await giveDose(clock, first.heifer.tagNumber, 1);
    await giveDose(clock, second.heifer.tagNumber, 1);
    const givenAt = clock.now().getTime();

    // The label said 30 days, not 3: both heifers are held for 30, whether or not either is dosed again.
    await vet.client.drugs.setWithdrawal({
      id: world.label.id,
      milkWithdrawalDays: 3,
      meatWithdrawalDays: 30,
    });
    const both = await Promise.all(
      [first, second].map(({ heifer, owner }) =>
        owner.client.animals.get({ tagNumber: heifer.tagNumber })
      )
    );
    for (const her of both) {
      expect(her.meatWithdrawalUntil).toEqual(new Date(givenAt + 30 * DAY));
    }

    // Lowered again, it frees nobody already dosed: that is the Vet's shortening, animal by animal.
    await vet.client.drugs.setWithdrawal({
      id: world.label.id,
      milkWithdrawalDays: 3,
      meatWithdrawalDays: 10,
    });
    const her = await first.owner.client.animals.get({
      tagNumber: first.heifer.tagNumber,
    });
    expect(her.meatWithdrawalUntil).toEqual(new Date(givenAt + 30 * DAY));
  });
});

describe("a dose whose phone kept the wrong time", () => {
  it("is not counted from before the work that asked for it was raised", async () => {
    const clock = new FakeClock("2032-10-20T02:00:00.000Z");
    const { heifer, owner } = await onACourse(clock, world.long.id);
    const dose = await doseOf(clock, heifer.tagNumber, 1);
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-holds", name: "ঘড়ি ভুল শেড ফোন" },
    });
    // The phone's clock was reset a month back; the dose went in this morning.
    const sent = await phone.client.sync.batch({
      key: `wrong-clock-${heifer.tagNumber}`,
      entries: [
        {
          id: `wrong-clock-entry-${heifer.tagNumber}`,
          seq: 1,
          recordedAt: new Date(clock.now().getTime() - 30 * DAY),
          kind: "step_completion" as const,
          instanceId: dose.instanceId,
          stepId: "dose",
          evidence: [true],
        },
      ],
    });
    expect(sent.results.every((one) => one.outcome === "applied")).toBe(true);

    const her = await owner.client.animals.get({ tagNumber: heifer.tagNumber });
    expect(her.meatWithdrawalUntil?.getTime()).toBeGreaterThanOrEqual(
      clock.now().getTime() + 28 * DAY - DAY
    );
  });
});

describe("the Withdrawal Summary a buyer holds", () => {
  it("lists a dose older than thirty days that still holds her", async () => {
    const clock = new FakeClock("2032-11-01T02:00:00.000Z");
    const { heifer } = await onACourse(clock, world.slow.id);
    await giveDose(clock, heifer.tagNumber, 1);

    clock.advance(35 * DAY);
    const later = await createTestClient(appRouter, { as: "owner", clock });
    const paper = await later.client.papers.withdrawalSummary({
      tagNumber: heifer.tagNumber,
    });
    expect(paper.clear).toBe(false);
    expect(paper.doses).toHaveLength(1);
  });
});
