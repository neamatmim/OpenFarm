import type { SopContent } from "@OpenFarm/domain";
import { DESHI_BREEDS } from "@OpenFarm/domain";
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

const setup = async () => {
  const owner = await as("owner", ARRIVED);
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.createShed({ name: suffix });
  const pen = async (name: string) =>
    await manager.client.sheds.createPen({
      quarantine: true,
      shedId: shed.id,
      name,
    });
  const growers = await pen("গ্রোয়ার পেন");
  const newcomers = await pen("নতুন পেন");
  const strong = await pen("ভালো পেন");
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
    [strong.id, grower.rationId],
    [plain.id, plainRation.rationId],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- four Pens, one after another
    await manager.client.feed.assignRation({ penId, rationId });
  }
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  weighingId = weighing.definitionId;
  const breeds = await manager.client.breeds.list();
  const deshi = breeds.find((one) => one.key === "local")?.id ?? "";
  const bull = async (
    penId: string,
    weightKg: number,
    {
      sex = "male",
      breedId,
    }: { sex?: "male" | "female"; breedId?: string } = {}
  ) => {
    const arrived = await manager.client.intakes.record({
      penId,
      sex,
      ...(breedId ? { breedId } : {}),
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
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
    // Deshi, at half a kilo a day: under what the Ration gives a cross, within what it gives a deshi bull.
    deshiFine: await bull(growers.id, 190, { breedId: deshi }),
    // Deshi, and slow even for deshi.
    deshiSlow: await bull(growers.id, 190, { breedId: deshi }),
    // A heifer bought to fatten, at half a kilo a day, and nobody wrote down her breed.
    heifer: await bull(growers.id, 190, { sex: "female" }),
    // Three crosses far above their Ration, and one within it — and far behind them.
    strong1: await bull(strong.id, 190),
    strong2: await bull(strong.id, 190),
    strong3: await bull(strong.id, 190),
    lagger: await bull(strong.id, 190),
  };
  return {
    pens: { growers, newcomers, plain, strong },
    rations: { grower },
    tags,
  };
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
    [tags.deshiFine, 195],
    [tags.deshiSlow, 195],
    [tags.heifer, 195],
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
    [tags.deshiFine, 200],
    [tags.deshiSlow, 200],
    [tags.heifer, 200],
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
  const strongPen = [tags.strong1, tags.strong2, tags.strong3, tags.lagger];
  await weigh(
    pens.strong.id,
    DAY_21,
    strongPen.map((tag) => [tag, 200] as [string, number])
  );
  await weigh(pens.strong.id, DAY_49, [
    // 33.6 kg in 28 days: 1.2 a day, 1.6 times the middle of their 0.6–0.9.
    [tags.strong1, 233.6],
    [tags.strong2, 233.6],
    [tags.strong3, 233.6],
    // 19.6 kg: 0.7 a day, within the Ration's range — and under four fifths of his penmates' 1.6.
    [tags.lagger, 219.6],
  ]);
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
    // 14 kg in 28 days: 0.5, within a deshi bull's 0.42–0.63.
    [tags.deshiFine, 214],
    // 10 kg in 28 days: 0.36, under even a deshi bull's 0.42.
    [tags.deshiSlow, 210],
    // 0.5 again, within a heifer's 0.48–0.72.
    [tags.heifer, 214],
  ]);
  await weigh(pens.plain.id, DAY_49, [[tags.plain, 207]]);
});

describe("the bulls gaining under their Ration's Expected Gain", () => {
  it("names the losing first, then the slow, each with the readings his gain runs between", async () => {
    const manager = await as("manager");
    const rows = await manager.client.fattening.underExpectedGain();
    // The slow cross is at 0.43 of his 0.6, seven tenths of it; the slow deshi bull at 0.36 of his 0.42, more; the
    // one behind his penmates is within his Ration's range, and comes last.
    expect(rows.map((one) => one.tagNumber)).toEqual([
      world.tags.losing,
      world.tags.slow,
      world.tags.deshiSlow,
      world.tags.lagger,
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
      // Nobody wrote down his breed: judged as a cross, which the Ration's figures are written for.
      expectedGain: GROWER_GAIN,
      adjustedFor: {
        deshiPercent: null,
        femalePercent: null,
        breedRecorded: false,
      },
      gain: {
        dailyGainKg: 0.43,
        overDays: 28,
        from: { weightKg: 200, weighedAt: new Date(DAY_21) },
        to: { weightKg: 212, weighedAt: new Date(DAY_49) },
      },
      standing: "under",
      outsideBand: false,
      // Six in his Pen are judged on their Ration; set against what each should gain, their middle is 0.76 of it —
      // for a cross like him, 0.57 a day — and he is under four fifths of that.
      penmates: { middleKg: 0.57, animals: 6 },
      underPenmates: true,
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
      adjustedFor: {
        deshiPercent: null,
        femalePercent: null,
        breedRecorded: false,
      },
      gain: null,
      standing: null,
      outsideBand: false,
      // Alone in his Pen: no group to set him beside.
      penmates: null,
      underPenmates: false,
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

  it("judges a deshi bull and a heifer against the farm's shares of what the Ration gives a crossbred bull", async () => {
    const manager = await as("manager");
    const rows = await manager.client.fattening.underExpectedGain();
    const tags = rows.map((one) => one.tagNumber);
    expect(tags).not.toContain(world.tags.deshiFine);
    expect(tags).not.toContain(world.tags.heifer);
    expect(
      rows.find((one) => one.tagNumber === world.tags.deshiSlow)
    ).toMatchObject({
      pen: { expectedGain: GROWER_GAIN },
      expectedGain: { lowKg: 0.42, highKg: 0.63 },
      adjustedFor: {
        deshiPercent: 70,
        femalePercent: null,
        breedRecorded: true,
      },
      gain: { dailyGainKg: 0.36 },
      standing: "under",
    });
    const board = await manager.client.fattening.board();
    expect(
      board.find((row) => row.tagNumber === world.tags.heifer)?.onRation
    ).toMatchObject({
      expectedGain: { lowKg: 0.48, highKg: 0.72 },
      adjustedFor: {
        deshiPercent: null,
        femalePercent: 80,
        breedRecorded: false,
      },
      gain: { dailyGainKg: 0.5 },
      standing: "within",
    });
  });

  it("names a bull within his Ration's range who is well behind his penmates, and none of them", async () => {
    const manager = await as("manager");
    const rows = await manager.client.fattening.underExpectedGain();
    expect(
      rows.find((one) => one.tagNumber === world.tags.lagger)
    ).toMatchObject({
      standing: "within",
      gain: { dailyGainKg: 0.7 },
      // Their middle is 1.6 times what the Ration should give: 1.2 a day for a cross.
      penmates: { middleKg: 1.2, animals: 4 },
      underPenmates: true,
    });
    const tags = rows.map((one) => one.tagNumber);
    for (const tag of [
      world.tags.strong1,
      world.tags.strong2,
      world.tags.strong3,
    ]) {
      expect(tags).not.toContain(tag);
    }
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

describe("the shares a deshi animal and a female are judged at", () => {
  it("are the Manager's to set, from three tenths to the whole, and move the judgement", async () => {
    const manager = await as("manager");
    try {
      for (const deshiGainPercent of [29, 101]) {
        // oxlint-disable-next-line no-await-in-loop -- one refusal at a time
        await expect(
          manager.client.farm.setParameters({ deshiGainPercent })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      await expect(
        manager.client.farm.setParameters({ femaleGainPercent: 101 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      // Judged as a cross, the deshi bull at half a kilo a day is under the Ration's 0.6.
      await manager.client.farm.setParameters({ deshiGainPercent: 100 });
      const later = await as("manager");
      const rows = await later.client.fattening.underExpectedGain();
      expect(rows.map((one) => one.tagNumber)).toContain(world.tags.deshiFine);
    } finally {
      await manager.client.farm.setParameters({
        deshiGainPercent: 70,
        femaleGainPercent: 80,
      });
    }
  });
});

describe("the share of his penmates a bull is measured at", () => {
  it("is the Manager's to set, from a half to nineteen twentieths, and moves the judgement", async () => {
    const manager = await as("manager");
    try {
      for (const penGainPercent of [49, 96]) {
        // oxlint-disable-next-line no-await-in-loop -- one refusal at a time
        await expect(
          manager.client.farm.setParameters({ penGainPercent })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      // At half his penmates' 1.6, the one at 0.93 of his Ration's middle is no longer behind them.
      await manager.client.farm.setParameters({ penGainPercent: 50 });
      const later = await as("manager");
      const rows = await later.client.fattening.underExpectedGain();
      expect(rows.map((one) => one.tagNumber)).not.toContain(world.tags.lagger);
    } finally {
      await manager.client.farm.setParameters({ penGainPercent: 80 });
    }
  });
});

describe("which breeds are deshi", () => {
  it("are the standard local breeds, as the farm is given them", async () => {
    const manager = await as("manager");
    const breeds = await manager.client.breeds.list();
    expect(
      breeds
        .filter((one) => one.deshi)
        .map((one) => one.key)
        .toSorted()
    ).toEqual([...DESHI_BREEDS].toSorted());
  });

  it("is the farm's to say, for its own breeds and the standard ones, and not Staff's", async () => {
    const manager = await as("manager");
    const added = await manager.client.breeds.add({
      nameBn: `শাহীওয়াল-দেশি ${suffix}`,
      deshi: true,
    });
    const deshiOf = async (id: string) => {
      const breeds = await manager.client.breeds.list();
      return breeds.find((one) => one.id === id)?.deshi;
    };
    expect(await deshiOf(added.id)).toBe(true);
    await manager.client.breeds.setDeshi({ id: added.id, deshi: false });
    expect(await deshiOf(added.id)).toBe(false);
    const staff = await as("staff");
    await expect(
      staff.client.breeds.setDeshi({ id: added.id, deshi: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await deshiOf(added.id)).toBe(false);
  });
});

describe("the target weight a bull is taken in towards", () => {
  // The farm's one Ration by weight with a gain is the growers' 150–250 kg at 0.6–0.9. Bought on 1 June for a window
  // opening on 1 October: 122 days, 101 of them after he has settled in. Grown past 250 kg he goes on at the growers'.
  const bought = {
    sex: "male" as const,
    arrivedAt: new Date(ARRIVED),
    targetWindowStart: "2037-10-01",
  };

  it("is suggested from the farm's Rations, low and high, for his breed", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.intakes.suggestTarget({ ...bought, weightKg: 200 })
    ).resolves.toEqual({
      // 200 + 0.6 × 101, and 200 + 0.9 × 101.
      lowKg: 260.6,
      highKg: 290.9,
      days: 122,
      windowStart: "2037-10-01",
    });
    const breeds = await manager.client.breeds.list();
    const deshi = breeds.find((one) => one.key === "local")?.id ?? "";
    await expect(
      manager.client.intakes.suggestTarget({
        ...bought,
        weightKg: 200,
        breedId: deshi,
      })
    ).resolves.toMatchObject({ lowKg: 242.4, highKg: 263.6 });
    // No Ration says what a 120 kg bull should gain.
    await expect(
      manager.client.intakes.suggestTarget({ ...bought, weightKg: 120 })
    ).resolves.toBe(null);
  });

  it("is the suggestion's low end when nobody types one, the typed one when somebody does, and the farm's own where no Ration says", async () => {
    const manager = await as("manager");
    const takeIn = async (weightKg: number, targetWeightKg?: number) => {
      const arrived = await manager.client.intakes.record({
        penId: world.pens.plain.id,
        seller: { name: `ব্যাপারী ${suffix}` },
        purchasePriceMoney: 60_000,
        weightKg,
        estimatedAgeMonths: 20,
        targetWindowEnd: "2037-10-05",
        paymentMethod: "cash",
        ...bought,
        ...(targetWeightKg === undefined ? {} : { targetWeightKg }),
      });
      return arrived.tagNumber;
    };
    const suggested = await takeIn(200);
    const typed = await takeIn(200, 300);
    const unknown = await takeIn(120);
    const board = await manager.client.fattening.board();
    const targetOf = (tag: string) =>
      board.find((row) => row.tagNumber === tag)?.targetWeightKg;
    expect(targetOf(suggested)).toBe(260.6);
    expect(targetOf(typed)).toBe(300);
    // The farm's own target weight, as it stands.
    expect(targetOf(unknown)).toBe(
      manager.context.farm?.fatteningTargetWeightKg
    );
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
