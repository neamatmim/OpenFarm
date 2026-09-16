import { and } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

// What the scale means: gain, days on feed, and what she will weigh at her Target Window.
//
// Every expected figure below is worked by hand from the readings, never re-derived the way the
// code derives them — a test that recomputes the answer can never disagree with it.

/** The weigh-in round this file walks: a scale reading per animal and nothing else. */
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

const setup = async () => {
  // The same time of day the rounds are walked at, so the spans between weighings are whole
  // days and the arithmetic below can be read.
  const clock = new FakeClock("2027-01-04T07:30:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const shed = await owner.client.herd.createShed({ name: `gain-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });

  /** Both bought on 4 January at 200 kg, fed towards the same Eid and the same weight. */
  const bull = async () =>
    await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `হাট ${suffix}` },
      purchasePriceBdt: 90_000,
      weightKg: 200,
      estimatedAgeMonths: 22,
      targetWindowStart: "2027-05-17",
      targetWindowEnd: "2027-05-19",
      targetWeightKg: 350,
    });
  const bulls = [await bull(), await bull(), await bull()];

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-gain-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();

  const sop = await owner.client.sops.create({ content: weighInSop() });
  return { owner, manager, pen, bulls, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** This file's SOP applies to the whole Fattening side, so it raises a round in every pen
 *  holding one. Retiring it stops new ones; what it already raised has to be shut. */
afterAll(async () => {
  const { eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.sop.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
});

/** One round of the weigh-in, weighing whichever animals the caller names. */
const weigh = async (day: string, readings: [number, number][]) => {
  const clock = new FakeClock(`${day}T07:30:00.000Z`);
  const scheduler = await createTestClient(appRouter, { as: "owner", clock });
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (candidate) => candidate.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: instance.id });
  for (const [index, kg] of readings) {
    // Sequential: the Steps of one round are recorded one animal at a time.
    // oxlint-disable-next-line no-await-in-loop
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: world.bulls[index]?.tagNumber ?? "",
      evidence: [kg],
    });
  }
};

const tagOf = (index: number) => world.bulls[index]?.tagNumber ?? "";

describe("gain, days on feed and the projections to Eid", () => {
  it("works the arithmetic out and never asks anybody to type it", async () => {
    // 200 kg on 4 January. 214 on 1 February, 228 on 15 February.
    await weigh("2027-02-01", [
      [0, 214],
      [1, 214],
      [2, 214],
    ]);
    await weigh("2027-02-15", [
      [0, 228],
      // The second bull has gone off his feed: 218 is 4 kg in a fortnight.
      [1, 218],
    ]);

    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-02-15T09:00:00.000Z"),
    });
    const her = await manager.client.animals.byTag({ tagNumber: tagOf(0) });

    // 42 days from 4 January to 15 February.
    expect(her.fattening?.daysOnFeed).toBe(42);
    expect(her.fattening?.latestKg).toBe(228);

    // Her Target Window opens on 17 May, and a farm day begins at midnight in Dhaka — which is
    // 18:00 the day before in UTC. From her weighing at 07:30 on 15 February that is 90.4375
    // days, and every projection below runs across it.
    //
    // Since intake: 28 kg over 42 days = 0.6667 a day, so 228 + 0.6667 × 90.4375 = 288.3.
    expect(her.fattening?.sinceIntake).toMatchObject({
      dailyGainKg: 0.67,
      overDays: 42,
      projectedKg: 288.3,
      reachesTarget: false,
    });

    // Lately: 14 kg over 14 days = exactly 1 a day, so 228 + 90.4375 = 318.4.
    expect(her.fattening?.recent).toMatchObject({
      dailyGainKg: 1,
      overDays: 14,
      projectedKg: 318.4,
      reachesTarget: false,
    });
  });

  it("says so rather than projecting from nothing", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-02-15T09:00:00.000Z"),
    });

    // The third bull has been on the scale once. There is a gain since intake to project
    // from, but no second reading and so no recent rate — and the farm says so plainly
    // rather than calling one reading a trend.
    const only = await manager.client.animals.byTag({ tagNumber: tagOf(2) });
    expect(only.fattening).not.toBeNull();
    expect(only.fattening?.sinceIntake).not.toBeNull();
    expect(only.fattening?.recent).toBeNull();
    expect(only.fattening?.onTrackFrom).toBe("sinceIntake");
  });

  it("shows the Owner who is on track and who has stopped gaining", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2027-02-15T09:00:00.000Z"),
    });
    const board = await owner.client.fattening.board({ penId: world.pen.id });

    const gaining = board.find((row) => row.tagNumber === tagOf(0));
    const stalling = board.find((row) => row.tagNumber === tagOf(1));

    // The first put on 14 kg in the last fortnight — a kilo a day against 0.67 over his whole
    // stay, so he is doing better lately. The second put on 4 kg in the same fortnight: 0.29 a
    // day against 18 kg over 42 days, which is 0.43. That gap is the point of showing both.
    expect(gaining?.recent?.dailyGainKg).toBe(1);
    expect(gaining?.sinceIntake?.dailyGainKg).toBe(0.67);
    expect(stalling?.recent?.dailyGainKg).toBe(0.29);
    expect(stalling?.sinceIntake?.dailyGainKg).toBe(0.43);
    // Neither will make 350 kg by Eid at the rate he is going — and the board says which rate
    // it judged on, so two animals in one list are not ranked by different measures in silence.
    expect(gaining?.onTrack).toBe(false);
    expect(gaining?.onTrackFrom).toBe("recent");
    expect(stalling?.onTrack).toBe(false);
  });

  it("does not tell a milker what the farm paid for a bull", async () => {
    const staff = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock("2027-02-15T09:00:00.000Z"),
    });
    // The roles matrix gives Intake to the Manager and the Owner; Barn Staff have no row.
    // They weigh her and they see what she weighs — not what she cost.
    const her = await staff.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.intake).toBeNull();
    expect(her.fattening?.latestKg).toBe(228);
    await expect(
      staff.client.fattening.board({ penId: world.pen.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
