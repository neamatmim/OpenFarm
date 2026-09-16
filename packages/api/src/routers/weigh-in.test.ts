import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

/** The weigh-in as the farm runs it: one round of the fattening pen, a scale reading per
 *  animal, and nothing else. */
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
  const owner = await createTestClient(appRouter, { as: "owner" });
  const manager = await createTestClient(appRouter, { as: "manager" });
  const shed = await owner.client.herd.createShed({ name: `weigh-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });

  const bull = async (weightKg: number) =>
    await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `হাট ${suffix}` },
      purchasePriceBdt: 90_000,
      weightKg,
      estimatedAgeMonths: 22,
    });
  const bulls = [await bull(200), await bull(220)];

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-weigh-${pen.id}`,
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

/** A round of the weigh-in on its own day, claimed by the Staff member who walks it. */
const round = async (day: string) => {
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
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  return { instance, staff, manager, clock };
};

const tagOf = (index: number) => world.bulls[index]?.tagNumber ?? "";

describe("the fortnightly weigh-in", () => {
  it("keeps a reading per animal, and shows them on her page", async () => {
    const { instance, staff } = await round("2027-02-01");

    const first = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagOf(0),
      evidence: [214],
    });
    expect(first.effect).toMatchObject({ kind: "weigh_in", weightKg: 214 });

    // The one that would not go up the crush is skipped with her reason, and the round is
    // still a round: the other animal is weighed and the work finishes.
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagOf(1),
      skipReason: "ক্রাশে ওঠেনি",
    });
    // Every animal in the pen has been answered for — one weighed, one skipped — so the round
    // is finished rather than left open on the overdue list.
    const board = await staff.client.instances.get({ id: instance.id });
    expect(board.completions).toHaveLength(2);
    expect(board.state).not.toBe("open");

    const her = await staff.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.weighIns).toHaveLength(1);
    expect(her.weighIns[0]).toMatchObject({ weightKg: 214, method: "scale" });

    // A skipped animal has no reading to her name — the round saw her and could not weigh her.
    const other = await staff.client.animals.byTag({ tagNumber: tagOf(1) });
    expect(other.weighIns).toHaveLength(0);
  });

  it("takes a jump nobody could have grown, and asks the Manager about it", async () => {
    const { instance, staff, manager } = await round("2027-02-15");

    // Fourteen days and sixty kilos: more than four a day, which no bull does. The barn wrote
    // it down, so it is kept (ADR 0002) — the farm does not throw away what somebody recorded.
    const taken = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagOf(0),
      evidence: [274],
    });
    expect(taken.effect).toMatchObject({
      kind: "weigh_in",
      weightKg: 274,
      flagged: true,
    });

    const her = await staff.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.weighIns).toHaveLength(2);
    // Newest first: her page answers "what does she weigh now" before anything else, and says
    // what was doubtful about it in the farm's own words.
    expect(her.weighIns[0]).toMatchObject({ weightKg: 274, flagged: true });
    expect(her.weighIns[0]?.flaggedNote).toContain("kg/day");

    // And the Manager is asked rather than left to notice.
    const board = await staff.client.instances.get({ id: instance.id });
    const entry = board.completions.find(
      (row) => row.stepId === "weigh" && row.animalId === her.id
    );
    const queue = await manager.client.review.open();
    const asked = queue.find(
      (row) => row.reason === "implausible_weight" && row.entityId === entry?.id
    );
    expect(asked).toBeDefined();

    // Put right to another figure still nobody could have grown: the Manager already has the reading in front of them,
    // and is not asked a second time.
    await correctStepAsShown(manager.client, {
      completionId: entry?.id ?? "",
      evidence: [270],
      reason: "স্কেলে আবার দেখা",
    });
    const again = await manager.client.review.open();
    expect(
      again.filter(
        (row) =>
          row.reason === "implausible_weight" && row.entityId === entry?.id
      )
    ).toHaveLength(1);
    // Closed again, because the queue is the whole Farm's and the tests here share it: one
    // left open is one more between the next test and the cap.
    await manager.client.review.resolve({
      id: asked?.id ?? "",
      resolution: "স্কেল দেখে নিশ্চিত করা হয়েছে",
    });

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagOf(1),
      evidence: [228],
    });
  });
});
