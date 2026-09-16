import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, HOUR } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/** The drying-off SOP: the cow stops milking and walks to the dry pen, and the walk is a
 *  Step of the procedure rather than something somebody remembers to record afterwards. */
const movingSop = (pens: { id: string; name: string }[]): SopContent => ({
  name: { bn: "শুকনো পেনে নিন", en: "Move to the dry pen" },
  purpose: { bn: "দুধ বন্ধ হলে গাভীকে সরান" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "walk",
      text: { bn: "গাভীকে পেনে নিয়ে যান" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: pens.map((pen) => ({
            value: pen.id,
            label: { bn: pen.name },
          })),
        },
      ],
      skipReasons: [{ bn: "আজ নয়" }],
      effect: { kind: "move" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `moves-${Date.now()}`,
  });
  const milking = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "দোহন পেন",
  });
  const dry = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "শুকনো পেন",
  });
  const sick = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "অসুস্থ পেন",
  });
  const sop = await owner.client.sops.create({
    content: movingSop([milking, dry, sick]),
  });
  return { owner, milking, dry, sick, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const aCowIn = async (
  owner: Awaited<ReturnType<typeof setup>>["owner"],
  penId: string
) =>
  await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });

const instanceFor = async (clock: FakeClock, penId: string) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId });
  const instance = today.find(
    (row) => row.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected the moving instance");
  }
  await owner.client.instances.claim({ id: instance.id });
  return { owner, instance };
};

describe("a Step that moves an animal", () => {
  it("walks her to the Pen the Step recorded, and the Move says which work moved her", async () => {
    const clock = new FakeClock("2027-02-01T02:00:00.000Z");
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, world.milking.id);
    const { owner, instance } = await instanceFor(clock, world.milking.id);

    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "walk",
      animalTag: cow.tagNumber,
      evidence: [world.dry.id],
    });

    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.dry.id);

    // Her history reads as one story: the Move, and the work that caused it.
    const [latest] = after.moves;
    expect(latest?.toPenId).toBe(world.dry.id);
    expect(latest?.fromPenId).toBe(world.milking.id);
    expect(latest?.instanceId).toBe(instance.id);
  });

  it("refuses a pen the Step never offered", async () => {
    const clock = new FakeClock("2027-02-02T02:00:00.000Z");
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, world.milking.id);
    const { owner, instance } = await instanceFor(clock, world.milking.id);

    await expect(
      owner.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "walk",
        animalTag: cow.tagNumber,
        evidence: ["not-a-pen-on-this-farm"],
      })
    ).rejects.toThrow(/not one of the things this step offers/u);

    // And she has not gone anywhere.
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.milking.id);
  });

  it("sends her on one journey however many times the phone sends the entry", async () => {
    const clock = new FakeClock("2027-02-03T02:00:00.000Z");
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, world.milking.id);
    const { owner, instance } = await instanceFor(clock, world.milking.id);

    const phone = await createTestClient(appRouter, {
      as: "owner",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-moves", name: "স্থানান্তর শেড ফোন" },
    });
    const batch = {
      key: `moves-replay-${cow.tagNumber}`,
      entries: [
        {
          id: `walk-${cow.tagNumber}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "step_completion" as const,
          instanceId: instance.id,
          stepId: "walk",
          animalTag: cow.tagNumber,
          evidence: [world.dry.id],
        },
      ],
    };
    const sent = await phone.client.sync.batch(batch);
    const again = await phone.client.sync.batch(batch);
    expect(again).toEqual(sent);

    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.dry.id);
    expect(
      after.moves.filter((move) => move.toPenId === world.dry.id)
    ).toHaveLength(1);
  });
});

describe("a Step the farm has moved past", () => {
  it("is kept for a person, and walks her nowhere, when she was moved while the phone held it", async () => {
    const clock = new FakeClock("2027-02-07T02:00:00.000Z");
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, world.milking.id);
    const { owner, instance } = await instanceFor(clock, world.milking.id);
    const walkedAt = clock.now();

    // An hour on, somebody walks her to the dry pen by hand, with signal.
    clock.advance(HOUR);
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.dry.id,
      reason: "হাতে সরানো",
    });

    // The phone that walked her to the sick pen an hour ago is only now in signal — a phone of this test's own, whose
    // sequence starts here.
    const phone = await createTestClient(appRouter, {
      as: "owner",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-moves-late", name: "দেরির শেড ফোন" },
    });
    const sent = await phone.client.sync.batch({
      key: `moves-late-${cow.tagNumber}`,
      entries: [
        {
          id: `walk-late-${cow.tagNumber}`,
          seq: 1,
          recordedAt: walkedAt,
          kind: "step_completion" as const,
          instanceId: instance.id,
          stepId: "walk",
          animalTag: cow.tagNumber,
          evidence: [world.sick.id],
        },
      ],
    });

    expect(sent.results[0]?.outcome).toBe("kept");
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.dry.id);
    expect(after.moves.some((move) => move.toPenId === world.sick.id)).toBe(
      false
    );
    const board = await owner.client.instances.get({ id: instance.id });
    expect(board.completions.filter((row) => row.stepId === "walk")).toEqual(
      []
    );
  });
});

describe("correcting a Step that moved her", () => {
  const walkHer = async (clock: FakeClock, toPenId: string) => {
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, world.milking.id);
    const { owner, instance } = await instanceFor(clock, world.milking.id);
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "walk",
      animalTag: cow.tagNumber,
      evidence: [toPenId],
    });
    const board = await owner.client.instances.get({ id: instance.id });
    const completion = board.completions.find(
      (row) => row.stepId === "walk" && row.animalId !== null
    );
    if (!completion) {
      throw new Error("expected the walk to be recorded");
    }
    return { owner, instance, cow, completionId: completion.id };
  };

  it("walks her to the Pen the Correction names, and does not send her twice", async () => {
    const clock = new FakeClock("2027-02-04T02:00:00.000Z");
    const { owner, cow, completionId } = await walkHer(clock, world.dry.id);

    await correctStepAsShown(owner.client, {
      completionId,
      evidence: [world.milking.id],
      reason: "ভুল পেন লেখা হয়েছিল",
    });

    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.milking.id);
    // One journey, corrected — not one journey and then another.
    expect(after.moves.filter((move) => move.completionId)).toHaveLength(1);
  });

  it("puts her back when the Correction says the walk never happened", async () => {
    const clock = new FakeClock("2027-02-05T02:00:00.000Z");
    const { owner, cow, completionId } = await walkHer(clock, world.dry.id);

    await correctStepAsShown(owner.client, {
      completionId,
      evidence: [],
      skipReason: "আজ নয়",
      reason: "গাভী সরানো হয়নি",
    });

    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.milking.id);
    expect(after.moves.filter((move) => move.completionId)).toEqual([]);
  });

  it("leaves her where the farm last saw her, and asks a person, when she has been moved since", async () => {
    const clock = new FakeClock("2027-02-06T02:00:00.000Z");
    const { owner, cow, completionId } = await walkHer(clock, world.dry.id);

    // Later that morning somebody walked her on, which is a fact this Correction does not
    // have.
    clock.advance(HOUR);
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.milking.id,
      reason: "হাতে সরানো",
    });

    // The Step should have said the sick pen.
    const corrected = await correctStepAsShown(owner.client, {
      completionId,
      evidence: [world.sick.id],
      reason: "ভুল পেন লেখা হয়েছিল",
    });

    expect(corrected.needsReview).toBe(true);
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.milking.id);
  });
});

describe("what the farm has learned since", () => {
  const walkHerFrom = async (
    clock: FakeClock,
    startPenId: string,
    chosenPenId: string
  ) => {
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, startPenId);
    const { owner, instance } = await instanceFor(clock, startPenId);
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "walk",
      animalTag: cow.tagNumber,
      evidence: [chosenPenId],
    });
    const board = await owner.client.instances.get({ id: instance.id });
    const completion = board.completions.find(
      (row) => row.stepId === "walk" && row.animalId !== null
    );
    if (!completion) {
      throw new Error("expected the walk to be recorded");
    }
    return { owner, cow, completionId: completion.id };
  };

  it("does not put her back when she was walked away and walked back again", async () => {
    const clock = new FakeClock("2027-03-01T02:00:00.000Z");
    const { owner, cow, completionId } = await walkHerFrom(
      clock,
      world.milking.id,
      world.dry.id
    );

    // Out of the dry pen and back into it by hand. She is standing where the Step left her,
    // but the farm has learned two things since.
    clock.advance(HOUR);
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.milking.id,
      reason: "ফিরিয়ে আনা",
    });
    clock.advance(HOUR);
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.dry.id,
      reason: "আবার শুকনো পেনে",
    });

    const corrected = await correctStepAsShown(owner.client, {
      completionId,
      evidence: [],
      skipReason: "আজ নয়",
      reason: "হাঁটা হয়নি",
    });

    expect(corrected.needsReview).toBe(true);
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    // Where the farm last saw her — not the pen she started the morning in.
    expect(after.pen?.id).toBe(world.dry.id);
  });

  it("does not walk her when the Step it is correcting never moved her", async () => {
    const clock = new FakeClock("2027-03-02T02:00:00.000Z");
    // The Step chose the Pen she was already standing in, so there was no journey to record.
    const { owner, cow, completionId } = await walkHerFrom(
      clock,
      world.milking.id,
      world.milking.id
    );

    clock.advance(HOUR);
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.dry.id,
      reason: "হাতে সরানো",
    });

    const corrected = await correctStepAsShown(owner.client, {
      completionId,
      evidence: [world.sick.id],
      reason: "ঠিক করা",
    });

    expect(corrected.needsReview).toBe(true);
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.dry.id);
  });

  it("refuses a pen the Step offers but the farm does not have", async () => {
    const clock = new FakeClock("2027-02-07T02:00:00.000Z");
    const first = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await aCowIn(first, world.milking.id);
    // A Version authored against a Pen that has since gone, or that was never this farm's.
    const ghostPen = { id: "pen-that-is-not-here", name: "ভূতুড়ে পেন" };
    const sop = await first.client.sops.create({
      content: movingSop([world.milking, ghostPen]),
    });
    await first.client.instances.ensureDue();
    const today = await first.client.instances.today({
      penId: world.milking.id,
    });
    const instance = today.find((row) => row.definitionId === sop.definitionId);
    if (!instance) {
      throw new Error("expected the moving instance");
    }
    await first.client.instances.claim({ id: instance.id });

    await expect(
      first.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "walk",
        animalTag: cow.tagNumber,
        evidence: [ghostPen.id],
      })
    ).rejects.toThrow(/No such pen/u);
  });
});
