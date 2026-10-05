import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What the farm's own bulls of each Breed put on, as a share of what their Rations should give a crossbred bull: one
// share a bull, from his longest measured stay, against the middle of that Ration's range as written — pooled over
// every Ration, and said once five bulls of a Breed have one. Worked by hand: each bull weighed 200 kg on day 21 and
// again on day 49, 28 farm days later.
//
// - The growers' Ration is written for 0.6–0.9 a day (middle 0.75); the finishers' for 0.8–1.2 (middle 1.0); the plain
//   Ration says no gain.
// - Jersey cross bulls: on the growers at 0.6, 0.75 and 0.9 — 80, 100 and 120 — and on the finishers at 0.8 and 1.0 —
//   80 and 100. Five: the middle 100, the middle half 80 to 100. A Jersey cross heifer at 0.75 is left out, and a
//   Jersey cross bull on the plain Ration, which says nothing to measure him against.
// - Deshi bulls, on the growers at 0.45, 0.6, 0.6, 0.6 and 0.75: 60, 80, 80, 80 and 100 of the Ration as written —
//   the middle 80. Cut to the deshi share first, 0.6 would read as 114.
// - Four Sahiwal bulls: one short of a figure.

const suffix = `breed-gains-${Date.now()}`;

const ARRIVED = "2037-06-01T04:00:00.000Z";
const DAY_21 = "2037-06-22T02:00:00.000Z";
const DAY_49 = "2037-07-20T02:00:00.000Z";
const AFTER = "2037-07-22T04:00:00.000Z";
const DAYS = 28;

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
  readings: readonly (readonly [string, number])[]
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

/** A Pen of animals, each with the gain a day it will show: tag and gain. */
type Herd = [string, number][];

let breedIds: Record<"jerseyCross" | "local" | "sahiwal", string>;

beforeAll(async () => {
  const owner = await as("owner", ARRIVED);
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.create({ name: suffix });
  const pen = async (name: string) =>
    await manager.client.sheds.pens.create({
      quarantine: true,
      shedId: shed.id,
      name,
    });
  const pens = {
    growers: await pen("গ্রোয়ার পেন"),
    finishers: await pen("ফিনিশার পেন"),
    plain: await pen("সাধারণ পেন"),
  };
  const straw = await manager.client.feed.items.create({
    name: { bn: `খড় ${suffix}` },
  });
  const ration = async (
    name: string,
    expectedGain?: { lowKg: number; highKg: number }
  ) =>
    await manager.client.feed.rations.save({
      name: { bn: `${name} ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
      band: { fromKg: 150, toKg: 250 },
      ...(expectedGain ? { expectedGain } : {}),
    });
  const rations = {
    growers: await ration("গ্রোয়ার", { lowKg: 0.6, highKg: 0.9 }),
    finishers: await ration("ফিনিশার", { lowKg: 0.8, highKg: 1.2 }),
    plain: await ration("সাধারণ"),
  };
  for (const [penId, rationId] of [
    [pens.growers.id, rations.growers.rationId],
    [pens.finishers.id, rations.finishers.rationId],
    [pens.plain.id, rations.plain.rationId],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- three Pens, one after another
    await manager.client.feed.rations.assign({ penId, rationId });
  }
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  weighingId = weighing.definitionId;
  const breeds = await manager.client.breeds.list();
  const breedOf = (key: string) =>
    breeds.find((one) => one.key === key)?.id ?? "";
  breedIds = {
    jerseyCross: breedOf("jerseyCross"),
    local: breedOf("local"),
    sahiwal: breedOf("sahiwal"),
  };
  const herd = async (
    penId: string,
    breedId: string,
    gains: readonly number[],
    sex: "male" | "female" = "male"
  ): Promise<Herd> => {
    const tags: Herd = [];
    for (const gain of gains) {
      // oxlint-disable-next-line no-await-in-loop -- one intake at a time, as the lorry is unloaded
      const arrived = await manager.client.intakes.record({
        penId,
        sex,
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
      tags.push([arrived.tagNumber, gain]);
    }
    return tags;
  };
  const growers = [
    ...(await herd(pens.growers.id, breedIds.jerseyCross, [0.6, 0.75, 0.9])),
    ...(await herd(
      pens.growers.id,
      breedIds.local,
      [0.45, 0.6, 0.6, 0.6, 0.75]
    )),
    ...(await herd(
      pens.growers.id,
      breedIds.sahiwal,
      [0.75, 0.75, 0.75, 0.75]
    )),
    ...(await herd(pens.growers.id, breedIds.jerseyCross, [0.75], "female")),
  ];
  const finishers = await herd(
    pens.finishers.id,
    breedIds.jerseyCross,
    [0.8, 1]
  );
  const plain = await herd(pens.plain.id, breedIds.jerseyCross, [1]);
  for (const [penId, animals] of [
    [pens.growers.id, growers],
    [pens.finishers.id, finishers],
    [pens.plain.id, plain],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one Pen's round at a time
    await weigh(
      penId,
      DAY_21,
      animals.map(([tag]) => [tag, 200] as const)
    );
    // oxlint-disable-next-line no-await-in-loop -- as above
    await weigh(
      penId,
      DAY_49,
      animals.map(
        ([tag, gain]) =>
          [tag, Math.round((200 + gain * DAYS) * 10) / 10] as const
      )
    );
  }
});

/** A Breed's figure of the farm's own, as the Breeds page reads it. */
const figureOf = async (role: "owner" | "manager", breedId: string) => {
  const client = await as(role);
  const shares = await client.client.breeds.farmShares();
  return shares[breedId] ?? null;
};

describe("what the farm's own bulls of a Breed put on", () => {
  it("is pooled across Rations, one share a bull, said from five as the middle one and the middle half", async () => {
    expect(await figureOf("manager", breedIds.jerseyCross)).toEqual({
      animals: 5,
      medianPercent: 100,
      lowPercent: 80,
      highPercent: 100,
    });
  });

  it("measures a deshi Breed against the Ration as written, never cut to the deshi share", async () => {
    expect(await figureOf("owner", breedIds.local)).toEqual({
      animals: 5,
      medianPercent: 80,
      lowPercent: 80,
      highPercent: 80,
    });
  });

  it("says nothing of a Breed with four", async () => {
    expect(await figureOf("owner", breedIds.sahiwal)).toBe(null);
  });

  it("is the Owner's and the Manager's to read, as the Breeds are", async () => {
    const staff = await as("staff");
    await expect(staff.client.breeds.farmShares()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
