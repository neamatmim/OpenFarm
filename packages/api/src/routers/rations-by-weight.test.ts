import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Ration by weight: napier by every hundred kilos the Pen weighs, minerals by the head. The Pen is weighed as the
// scale last said — each animal's latest Weigh-in the farm did not doubt, or her Intake — and an animal nobody weighed
// counts at the average of those who were.

const suffix = `by-weight-${Date.now()}`;
const ARRIVED = "2036-01-01T04:00:00.000Z";

const as = (role: "owner" | "manager", instant: string) =>
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

const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}`, en: "Weigh-in" },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
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

const setup = async () => {
  const owner = await as("owner", ARRIVED);
  const feeding = await owner.client.sops.create({ content: feedingSop() });
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const bulls = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "ষাঁড় পেন",
  });
  const heifers = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "বকনা পেন",
  });
  const napier = await manager.client.feed.addItem({
    name: { bn: `নেপিয়ার ${suffix}` },
  });
  const minerals = await manager.client.feed.addItem({
    name: { bn: `মিনারেল ${suffix}` },
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `ওজনে রেশন ${suffix}` },
    items: [
      { feedItemId: napier.id, kgPer100KgPerDay: 3 },
      { feedItemId: minerals.id, kgPerAnimalPerDay: 0.1 },
    ],
  });
  for (const pen of [bulls, heifers]) {
    // oxlint-disable-next-line no-await-in-loop -- two Pens, one after the other
    await manager.client.feed.assignRation({
      penId: pen.id,
      rationId: ration.rationId,
    });
  }
  const bull = async (weightKg: number) =>
    await manager.client.intake.record({
      penId: bulls.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2036-05-01",
      targetWindowEnd: "2036-05-05",
    });
  const light = await bull(200);
  const heavy = await bull(300);
  const unweighed = (penId: string) =>
    manager.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
      source: "born",
      aliases: [],
    });
  // Born on the farm and never on the scale: counted at the Pen's average.
  await unweighed(bulls.id);
  await unweighed(heifers.id);
  await unweighed(heifers.id);
  return {
    pens: { bulls, heifers },
    items: { napier, minerals },
    tags: { light: light.tagNumber, heavy: heavy.tagNumber },
    sops: { feeding: feeding.definitionId, weighing: weighing.definitionId },
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** The morning's work of one kind in the bulls' Pen, raised and claimed. */
const dueIn = async (day: string, definitionId: string) => {
  const owner = await as("owner", `${day}T07:30:00.000Z`);
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({
    penId: world.pens.bulls.id,
  });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error("expected the work to be due");
  }
  await owner.client.instances.claim({ id: instance.id });
  return { owner, instance };
};

/** The crush, one bull after another. */
const weigh = async (day: string, readings: [string, number][]) => {
  const { owner, instance } = await dueIn(day, world.sops.weighing);
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- the crush takes one animal at a time
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

const targetOf = async (penId: string, instant: string) => {
  const manager = await as("manager", instant);
  return await manager.client.feed.target({ penId });
};

const quantityOf = (
  target: Awaited<ReturnType<typeof targetOf>>,
  feedItemId: string
) => target.items.find((one) => one.feedItemId === feedItemId)?.quantity;

describe("a Ration by weight", () => {
  it("feeds the Pen for what it weighs, the unweighed at the average, and minerals by the head", async () => {
    const target = await targetOf(
      world.pens.bulls.id,
      "2036-01-02T04:00:00.000Z"
    );
    // 200 and 300 at Intake, and the calf at their average: 750 kg.
    expect(target.herd).toEqual({
      weightKg: 750,
      weighed: 2,
      unweighed: 1,
      oldestWeighedAt: new Date(ARRIVED),
    });
    // Three kilos a day for every hundred, fed twice: 3 × 7.5 ÷ 2 = 11.25, to the barn scale's 100 g.
    expect(quantityOf(target, world.items.napier.id)).toBe(11.3);
    // A tenth of a kilo a head, three head, fed twice.
    expect(quantityOf(target, world.items.minerals.id)).toBe(0.2);
  });

  it("follows the scale once they are weighed", async () => {
    await weigh("2036-01-04", [
      [world.tags.light, 210],
      [world.tags.heavy, 300],
    ]);
    const target = await targetOf(
      world.pens.bulls.id,
      "2036-01-04T09:00:00.000Z"
    );
    // 210 and 300, and the calf at 255: 765 kg.
    expect(target.herd?.weightKg).toBe(765);
    expect(quantityOf(target, world.items.napier.id)).toBe(11.5);
  });

  it("does not follow a reading the farm doubted", async () => {
    // Three hundred kilos in two days: the scale slipped, and the reading waits for the Manager.
    await weigh("2036-01-06", [[world.tags.heavy, 600]]);
    const target = await targetOf(
      world.pens.bulls.id,
      "2036-01-06T09:00:00.000Z"
    );
    expect(target.herd?.weightKg).toBe(765);
  });

  it("gives no figure by weight for a Pen nobody weighed, and still feeds it by the head", async () => {
    const target = await targetOf(
      world.pens.heifers.id,
      "2036-01-02T04:00:00.000Z"
    );
    expect(target.herd).toEqual({
      weightKg: null,
      weighed: 0,
      unweighed: 2,
      oldestWeighedAt: null,
    });
    expect(quantityOf(target, world.items.napier.id)).toBeNull();
    expect(quantityOf(target, world.items.minerals.id)).toBe(0.1);
  });

  it("keeps with the Feeding what the Pen weighed, so its target can still be shown", async () => {
    const { owner, instance } = await dueIn("2036-01-07", world.sops.feeding);
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "feed",
      evidence: [true],
      feeding: [
        { feedItemId: world.items.napier.id, givenKg: 11.5 },
        { feedItemId: world.items.minerals.id, givenKg: 0.2 },
      ],
    });
    const board = await owner.client.instances.get({ id: instance.id });
    expect(board.fed).toMatchObject({ animals: 3, herdWeightKg: 765 });
    expect(board.fed?.lines).toContainEqual({
      feedItemId: world.items.napier.id,
      targetKg: 11.5,
      givenKg: 11.5,
      leftoverKg: 0,
    });
  });
});
