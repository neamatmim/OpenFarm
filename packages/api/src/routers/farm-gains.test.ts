import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What the farm's own animals have put on eating each Ration, beside what the Ration is written to give. Every gain
// below is worked by hand from the readings: day 21 to day 49 is 28 farm days.

const suffix = `farm-gains-${Date.now()}`;

const ARRIVED = "2037-06-01T04:00:00.000Z";
const DAY_21 = "2037-06-22T02:00:00.000Z";
const DAY_49 = "2037-07-20T02:00:00.000Z";
const DAY_50 = "2037-07-21T04:00:00.000Z";
const AFTER = "2037-07-22T04:00:00.000Z";

const as = (role: "owner" | "manager" | "staff", instant: string = AFTER) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** The round that puts a bull on the scale, and nothing else. */
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

let weighingId = "";

/** One Pen's weighing on one morning: each tag with what the scale said. */
const weigh = async (
  penId: string,
  instant: string,
  readings: (readonly [string, number])[]
) => {
  const manager = await as("manager", instant);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const work = today.find((row) => row.definitionId === weighingId);
  if (!work) {
    throw new Error("expected the weighing to be due");
  }
  await manager.client.work.claim({ id: work.id });
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
    await manager.client.work.completeStep({
      instanceId: work.id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

/** Five crossbred bulls at 0.5 to 0.9 kg a day, from 200 kg on day 21: 14, 16.8, 19.6, 22.4 and 25.2 kg in 28 days. */
const CROSS_GAINS = [14, 16.8, 19.6, 22.4, 25.2];
/** Four deshi bulls: one short of a figure. */
const DESHI_GAINS = [8.4, 11.2, 14, 16.8];

const setup = async () => {
  const owner = await as("owner", ARRIVED);
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.createShed({ name: suffix });
  const growers = await manager.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: "গ্রোয়ার পেন",
  });
  const switched = await manager.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: "বদলানো পেন",
  });
  const straw = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  const ration = async (name: string) =>
    await manager.client.feed.saveRation({
      name: { bn: `${name} ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
      band: { fromKg: 150, toKg: 250 },
      expectedGain: { lowKg: 0.6, highKg: 0.9 },
    });
  const grower = await ration("গ্রোয়ার");
  const later = await ration("পরের রেশন");
  for (const penId of [growers.id, switched.id]) {
    // oxlint-disable-next-line no-await-in-loop -- two Pens, one after another
    await manager.client.feed.assignRation({
      penId,
      rationId: grower.rationId,
    });
  }
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  weighingId = weighing.definitionId;
  const breeds = await manager.client.breeds.list();
  const breedOf = (key: string) =>
    breeds.find((one) => one.key === key)?.id ?? "";
  const bull = async (penId: string, breedId: string) => {
    const arrived = await manager.client.intakes.record({
      penId,
      sex: "male",
      breedId,
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg: 195,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2037-10-01",
      targetWindowEnd: "2037-10-05",
      targetWeightKg: 300,
      paymentMethod: "cash",
    });
    return arrived.tagNumber;
  };
  const herd = async (
    penId: string,
    breedId: string,
    gainsKg: readonly number[]
  ) => {
    const tags: [string, number][] = [];
    for (const gainKg of gainsKg) {
      // oxlint-disable-next-line no-await-in-loop -- one intake at a time, as the lorry is unloaded
      tags.push([await bull(penId, breedId), gainKg]);
    }
    return tags;
  };
  return {
    pens: { growers, switched },
    rations: { grower: grower.rationId, later: later.rationId },
    cross: await herd(growers.id, breedOf("friesianCross"), CROSS_GAINS),
    deshi: await herd(growers.id, breedOf("local"), DESHI_GAINS),
    // Five more crosses, in a Pen put on another Ration after they were weighed.
    elsewhere: await herd(switched.id, breedOf("friesianCross"), CROSS_GAINS),
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
  const inGrowers = [...world.cross, ...world.deshi];
  await weigh(
    world.pens.growers.id,
    DAY_21,
    inGrowers.map(([tag]) => [tag, 200] as const)
  );
  await weigh(
    world.pens.switched.id,
    DAY_21,
    world.elsewhere.map(([tag]) => [tag, 200] as const)
  );
  await weigh(
    world.pens.growers.id,
    DAY_49,
    inGrowers.map(([tag, gainKg]) => [tag, 200 + gainKg] as const)
  );
  await weigh(
    world.pens.switched.id,
    DAY_49,
    world.elsewhere.map(([tag, gainKg]) => [tag, 200 + gainKg] as const)
  );
  const manager = await as("manager", DAY_50);
  // The fastest cross is sold: gone from the farm, and still what the Ration put on him.
  const [fastest] = world.cross.at(-1) ?? [];
  await manager.client.sales.record({
    tagNumber: fastest ?? "",
    buyer: { name: `কসাই ${suffix}` },
    priceMoney: 120_000,
    weightKg: 225.2,
    destination: "গাবতলী",
    vehicle: "ঢাকা মেট্রো ট ১১-২২৩৩",
    driver: "করিম",
  });
  await manager.client.feed.assignRation({
    penId: world.pens.switched.id,
    rationId: world.rations.later,
  });
});

describe("what the farm's own animals put on eating a Ration", () => {
  it("is said for a kind once five have a gain — the sold ones counted — as the middle one and the middle half", async () => {
    const manager = await as("manager");
    const rows = await manager.client.feed.farmGains();
    expect(rows.find((one) => one.rationId === world.rations.grower)).toEqual({
      rationId: world.rations.grower,
      rationName: `গ্রোয়ার ${suffix}`,
      // 0.5, 0.6, 0.7, 0.8, 0.9 a day. Four deshi bulls are one short of a figure.
      figures: {
        cross: { animals: 5, medianKg: 0.7, lowKg: 0.6, highKg: 0.8 },
      },
    });
  });

  it("does not credit a Ration with what a Pen gained before it was put on it", async () => {
    const manager = await as("manager");
    const rows = await manager.client.feed.farmGains();
    expect(
      rows.find((one) => one.rationId === world.rations.later)?.figures
    ).toEqual({});
  });

  it("is the Owner's and the Manager's, who write the Rations", async () => {
    const owner = await as("owner");
    await expect(owner.client.feed.farmGains()).resolves.toEqual(
      expect.any(Array)
    );
    const staff = await as("staff");
    await expect(staff.client.feed.farmGains()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
