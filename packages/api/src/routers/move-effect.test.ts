import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
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
  const sop = await owner.client.sops.create({
    content: movingSop([milking, dry]),
  });
  return { owner, milking, dry, sop };
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

  it("refuses a pen that is not this farm's", async () => {
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
    ).rejects.toThrow(/No such pen/u);

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

    await owner.client.instances.correctStep({
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

    await owner.client.instances.correctStep({
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

    // Somebody walked her on afterwards, which is a fact this Correction does not have.
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.milking.id,
      reason: "হাতে সরানো",
    });

    const corrected = await owner.client.instances.correctStep({
      completionId,
      evidence: [world.dry.id],
      reason: "সময় ঠিক করা",
    });

    expect(corrected.needsReview).toBe(true);
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.pen?.id).toBe(world.milking.id);
  });
});
