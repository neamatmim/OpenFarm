import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The weight a bull was bought at is a figure the Manager typed at the livestock market. A fortnight on, a well bull weighs more
 * than he came off the lorry at, not less: his first Weigh-in under it by more than the Owner's line is told to the
 * Owner, once — the reading is right; it is the purchase she asks about.
 */
const suffix = `arrival-short-${Date.now()}`;

const ARRIVED = "2084-03-01T04:00:00.000Z";
// Weighed at eight in the morning, twelve, twenty-six and forty days after he came.
const DAY_12 = "2084-03-13T02:00:00.000Z";
const DAY_26 = "2084-03-27T02:00:00.000Z";
const DAY_40 = "2084-04-10T02:00:00.000Z";

const as = (role: "owner" | "manager", instant: string) =>
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
let penId = "";
const tags = { short: "", fine: "", twice: "", dips: "", late: "" };
const intakeOf = new Map<string, string>();

/** The Pen's weighing on one morning: each tag with what the scale said. */
const weigh = async (instant: string, readings: [string, number][]) => {
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

const toldOf = async (tag: string, role: "owner" | "manager" = "owner") =>
  await scratchDb().query.alert.findMany({
    where: {
      kind: "arrival_weight_short",
      entityId: intakeOf.get(tag) ?? "",
      userId: thePerson(role).id,
    },
    columns: { params: true },
  });

beforeAll(async () => {
  const owner = await as("owner", ARRIVED);
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = await manager.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `নতুন ${suffix}`,
  });
  penId = pen.id;
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  weighingId = weighing.definitionId;
  for (const key of Object.keys(tags) as (keyof typeof tags)[]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
    const bull = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${key} ${suffix}` },
      purchasePriceMoney: 90_000,
      weightKg: 280,
      estimatedAgeMonths: 24,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2084-06-01",
      targetWindowEnd: "2084-06-05",
    });
    tags[key] = bull.tagNumber;
    intakeOf.set(bull.tagNumber, bull.intakeId);
  }
  await weigh(DAY_12, [
    [tags.short, 255],
    [tags.fine, 270],
    [tags.twice, 250],
    [tags.dips, 285],
  ]);
  await weigh(DAY_26, [
    [tags.twice, 252],
    [tags.dips, 260],
  ]);
  await weigh(DAY_40, [[tags.late, 250]]);
});

describe("the weight a bull was bought at, against his first Weigh-in", () => {
  it("is told to the Owner when he weighs more than her line under it", async () => {
    const told = await toldOf(tags.short);
    expect(told).toHaveLength(1);
    expect(told[0]?.params).toMatchObject({
      tag: tags.short,
      seller: `ব্যাপারী short ${suffix}`,
      arrivalKg: 280,
      weighedKg: 255,
      days: 12,
    });
    // The Manager bought him; it is the Owner who asks.
    expect(await toldOf(tags.short, "manager")).toHaveLength(0);
  });

  it("is not told within the line", async () => {
    expect(await toldOf(tags.fine)).toHaveLength(0);
  });

  it("is told once, and not again on a later Weigh-in", async () => {
    expect(await toldOf(tags.twice)).toHaveLength(1);
  });

  it("is read against his first Weigh-in only, not a later one", async () => {
    // Heavier than he was bought at a fortnight on; a later dip is his gain's business, not the purchase's.
    expect(await toldOf(tags.dips)).toHaveLength(0);
  });

  it("is not judged past his first thirty days", async () => {
    expect(await toldOf(tags.late)).toHaveLength(0);
  });

  it("is the Owner's line to move, not the Manager's", async () => {
    const manager = await as("manager", DAY_40);
    await expect(
      manager.client.farm.setParameters({ arrivalShortPercent: 10 })
    ).rejects.toThrow("Owner");
    const owner = await as("owner", DAY_40);
    await expect(
      owner.client.farm.setParameters({ arrivalShortPercent: 10 })
    ).resolves.toBeDefined();
  });
});
