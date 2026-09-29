import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Ration's Expected Gain — the kilos a day it is written to put on the animals that eat it — and the bulls gaining
// under it. Each bull below is built so that one rule is all that keeps him in or out of the list: switch that rule
// off and he moves. Every rate is worked by hand from the readings, never the way the code works it.

const suffix = `gain-${Date.now()}`;

// Bought on 1 June at ten in the morning; weighed at eight on the days below, which are farm days after that.
const ARRIVED = "2037-06-01T04:00:00.000Z";
const DAY_7 = "2037-06-08T02:00:00.000Z";
const DAY_21 = "2037-06-22T02:00:00.000Z";
const DAY_30 = "2037-07-01T04:00:00.000Z";
const DAY_35 = "2037-07-06T02:00:00.000Z";
const DAY_49 = "2037-07-20T02:00:00.000Z";
const AFTER = "2037-07-21T04:00:00.000Z";

const GROWER_GAIN = { lowKg: 0.6, highKg: 0.9 };

const as = (
  role: "owner" | "manager" | "staff" | "vet",
  instant: string = AFTER
) => createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

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
  readings: [string, number][]
) => {
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  const work = today.find((row) => row.definitionId === weighingId);
  if (!work) {
    throw new Error("expected the weighing to be due");
  }
  await manager.client.instances.claim({ id: work.id });
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
    await manager.client.instances.completeStep({
      instanceId: work.id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

const setup = async () => {
  const owner = await as("owner", ARRIVED);
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = async (name: string) =>
    await manager.client.herd.createPen({ shedId: shed.id, name });
  const growers = await pen("গ্রোয়ার পেন");
  const newcomers = await pen("নতুন পেন");
  const plain = await pen("সাধারণ পেন");
  const straw = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  const grower = await manager.client.feed.saveRation({
    name: { bn: `গ্রোয়ার ${suffix}` },
    items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
    band: { fromKg: 150, toKg: 250 },
    expectedGain: GROWER_GAIN,
  });
  const plainRation = await manager.client.feed.saveRation({
    name: { bn: `সাধারণ ${suffix}` },
    items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
  });
  for (const [penId, rationId] of [
    [growers.id, grower.rationId],
    [newcomers.id, grower.rationId],
    [plain.id, plainRation.rationId],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- three Pens, one after another
    await manager.client.feed.assignRation({ penId, rationId });
  }
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  weighingId = weighing.definitionId;
  const bull = async (penId: string, weightKg: number) => {
    const arrived = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2037-10-01",
      targetWindowEnd: "2037-10-05",
    });
    return arrived.tagNumber;
  };
  const tags = {
    slow: await bull(growers.id, 190),
    good: await bull(growers.id, 190),
    losing: await bull(growers.id, 250),
    // Weighed once too far from its neighbour to be believed, downwards.
    doubted: await bull(growers.id, 240),
    // Slow, and grown past the growers' 250 kg: the finishers' Ration is his to be judged by, once he is moved.
    outgrown: await bull(growers.id, 245),
    // Weighed before he had settled in and once after: his only rate runs from his first week.
    newcomer: await bull(newcomers.id, 200),
    // Slow on a Ration that says nothing of gain; then walked to the growers on day 30.
    moved: await bull(plain.id, 200),
    plain: await bull(plain.id, 200),
  };
  return { pens: { growers, newcomers, plain }, rations: { grower }, tags };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
  const { pens, tags } = world;
  await weigh(pens.growers.id, DAY_7, [
    [tags.slow, 195],
    [tags.good, 195],
    [tags.losing, 250],
    [tags.doubted, 240],
    [tags.outgrown, 250],
  ]);
  await weigh(pens.newcomers.id, DAY_7, [[tags.newcomer, 200]]);
  await weigh(pens.plain.id, DAY_7, [
    [tags.moved, 200],
    [tags.plain, 200],
  ]);
  await weigh(pens.growers.id, DAY_21, [
    [tags.slow, 200],
    [tags.good, 200],
    [tags.losing, 250],
    [tags.doubted, 240],
    [tags.outgrown, 255],
  ]);
  await weigh(pens.plain.id, DAY_21, [
    [tags.moved, 205],
    [tags.plain, 205],
  ]);
  const manager = await as("manager", DAY_30);
  await manager.client.animals.move({
    tagNumber: tags.moved,
    toPenId: pens.growers.id,
  });
  await weigh(pens.newcomers.id, DAY_35, [[tags.newcomer, 205]]);
  await weigh(pens.growers.id, DAY_49, [
    // 12 kg in 28 days: 0.43 a day, under 0.6.
    [tags.slow, 212],
    // 22 kg in 28 days: 0.79, within.
    [tags.good, 222],
    // 7 kg lost in 28 days: -0.25.
    [tags.losing, 243],
    // 90 kg lost in four weeks is more than a bull loses: the reading is doubted, and followed by nobody. Followed,
    // it would read as a bull of 150 kg — inside the band — losing 3.2 kg a day.
    [tags.doubted, 150],
    // 7 kg in 28 days would be under, but he weighs 262 kg on a Ration written for up to 250.
    [tags.outgrown, 262],
    // Moved in on day 30; his rate on this Ration has no reading four weeks back to run from.
    [tags.moved, 208],
  ]);
  await weigh(pens.plain.id, DAY_49, [[tags.plain, 207]]);
});

describe("the bulls gaining under their Ration's Expected Gain", () => {
  it("names the losing first, then the slow, each with the readings his gain runs between", async () => {
    const manager = await as("manager");
    const rows = await manager.client.fattening.underExpectedGain();
    expect(rows.map((one) => one.tagNumber)).toEqual([
      world.tags.losing,
      world.tags.slow,
    ]);
    expect(rows[1]).toEqual({
      animalId: expect.any(String),
      tagNumber: world.tags.slow,
      pen: {
        penId: world.pens.growers.id,
        penName: `${suffix} / গ্রোয়ার পেন`,
        rationName: `গ্রোয়ার ${suffix}`,
        expectedGain: GROWER_GAIN,
      },
      gain: {
        dailyGainKg: 0.43,
        overDays: 28,
        from: { weightKg: 200, weighedAt: new Date(DAY_21) },
        to: { weightKg: 212, weighedAt: new Date(DAY_49) },
      },
      standing: "under",
      outsideBand: false,
    });
    expect(rows[0]).toMatchObject({
      standing: "losing",
      gain: { dailyGainKg: -0.25 },
    });
  });

  it("follows no reading the farm doubted", async () => {
    const manager = await as("manager");
    const rows = await manager.client.fattening.underExpectedGain();
    expect(rows.map((one) => one.tagNumber)).not.toContain(world.tags.doubted);
  });

  it("does not count the days before a bull settled in, nor the Ration he ate before", async () => {
    // The newcomer's 5 kg from day 7 to day 35 would read 0.18 a day; the moved bull's 3 kg from day 21 to day 49,
    // 0.11. Neither has been settled on this Ration four weeks.
    const manager = await as("manager");
    const board = await manager.client.fattening.board();
    const onRationOf = (tag: string) =>
      board.find((row) => row.tagNumber === tag)?.onRation;
    expect(onRationOf(world.tags.newcomer)).toEqual({
      expectedGain: GROWER_GAIN,
      gain: null,
      standing: null,
      outsideBand: false,
    });
    expect(onRationOf(world.tags.moved)).toMatchObject({
      gain: null,
      standing: null,
    });
  });

  it("does not judge a bull by a Ration written for other weights, and says so", async () => {
    const manager = await as("manager");
    const rows = await manager.client.fattening.underExpectedGain();
    expect(rows.map((one) => one.tagNumber)).not.toContain(world.tags.outgrown);
    const board = await manager.client.fattening.board();
    expect(
      board.find((row) => row.tagNumber === world.tags.outgrown)?.onRation
    ).toMatchObject({
      gain: { dailyGainKg: 0.25, overDays: 28 },
      standing: null,
      outsideBand: true,
    });
  });

  it("puts each bull's standing on the board, and nothing for one whose Ration says no gain", async () => {
    const owner = await as("owner");
    const board = await owner.client.fattening.board();
    const onRationOf = (tag: string) =>
      board.find((row) => row.tagNumber === tag)?.onRation;
    expect(onRationOf(world.tags.good)).toMatchObject({
      gain: { dailyGainKg: 0.79, overDays: 28 },
      standing: "within",
    });
    expect(onRationOf(world.tags.plain)).toBe(null);
  });

  it("is the Owner's and the Manager's, not Staff's or the Vet's", async () => {
    const owner = await as("owner");
    await expect(owner.client.fattening.underExpectedGain()).resolves.toEqual(
      expect.any(Array)
    );
    const staff = await as("staff");
    await expect(staff.client.fattening.underExpectedGain()).rejects.toThrow();
    const vet = await as("vet");
    await expect(vet.client.fattening.underExpectedGain()).rejects.toThrow();
  });
});

describe("how far back a gain is read", () => {
  it("is the Manager's to set, never under a fortnight, and moves the judgement", async () => {
    const manager = await as("manager");
    try {
      for (const gainReadDays of [13, 91]) {
        // oxlint-disable-next-line no-await-in-loop -- one refusal at a time
        await expect(
          manager.client.farm.setParameters({ gainReadDays })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      // Nobody on this farm has a reading eight weeks before his latest.
      await manager.client.farm.setParameters({ gainReadDays: 56 });
      const later = await as("manager");
      await expect(later.client.fattening.underExpectedGain()).resolves.toEqual(
        []
      );
    } finally {
      await manager.client.farm.setParameters({ gainReadDays: 28 });
    }
  });
});

describe("a Ration's Expected Gain", () => {
  it("is kept when a Ration is saved without it, and cleared by saying none", async () => {
    const manager = await as("manager");
    const straw = await manager.client.feed.addItem({
      name: { bn: `ঘাস ${suffix}` },
    });
    const saved = await manager.client.feed.saveRation({
      name: { bn: `ফিনিশার ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 2 }],
      expectedGain: { lowKg: 0.8, highKg: 1.1 },
    });
    const listed = async () => {
      const rations = await manager.client.feed.rations();
      return rations.find((one) => one.id === saved.rationId)?.expectedGain;
    };
    expect(await listed()).toEqual({ lowKg: 0.8, highKg: 1.1 });
    await manager.client.feed.saveRation({
      rationId: saved.rationId,
      name: { bn: `ফিনিশার ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 2.5 }],
    });
    expect(await listed()).toEqual({ lowKg: 0.8, highKg: 1.1 });
    await manager.client.feed.saveRation({
      rationId: saved.rationId,
      name: { bn: `ফিনিশার ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 2.5 }],
      expectedGain: null,
    });
    expect(await listed()).toBe(null);
  });

  it("refuses a low above its high, and a gain no bull makes", async () => {
    const manager = await as("manager");
    const straw = await manager.client.feed.addItem({
      name: { bn: `ভুসি ${suffix}` },
    });
    const saving = (expectedGain: { lowKg: number; highKg: number }) =>
      manager.client.feed.saveRation({
        name: { bn: `ভুল ${suffix}` },
        items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
        expectedGain,
      });
    await expect(saving({ lowKg: 0.9, highKg: 0.6 })).rejects.toThrow(
      /Low must not be above High/u
    );
    await expect(saving({ lowKg: 0.6, highKg: 4 })).rejects.toThrow(
      /which no bull gains/u
    );
  });
});
