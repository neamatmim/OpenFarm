import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** The daily health walk: somebody walks the pen and says what they saw, cow by cow. */
const healthWalkSop = (): SopContent => ({
  name: { bn: "স্বাস্থ্য পরিদর্শন", en: "Health walk" },
  purpose: { bn: "প্রতিটি পশু দেখে যা চোখে পড়ে তা লিখুন" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 180,
  steps: [
    {
      id: "look",
      text: { bn: "পশুটিকে দেখুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "well", label: { bn: "সুস্থ" } },
            { value: "lame", label: { bn: "খোঁড়াচ্ছে" } },
            { value: "bulling", label: { bn: "গরম" } },
          ],
        },
      ],
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }],
      effect: { kind: "sighting" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `sightings-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "পরিদর্শন পেন",
  });
  const sop = await owner.client.sops.create({ content: healthWalkSop() });
  return { owner, pen, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const aCow = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  return await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
};

const walkThePen = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (row) => row.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected the health walk");
  }
  await owner.client.instances.claim({ id: instance.id });
  return { owner, instance };
};

describe("what somebody saw on the round", () => {
  it("records the Sighting against the animal, naming the work and the person", async () => {
    const clock = new FakeClock("2027-04-01T02:00:00.000Z");
    const cow = await aCow(clock);
    const { owner, instance } = await walkThePen(clock);

    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "look",
      animalTag: cow.tagNumber,
      evidence: ["lame"],
    });

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.sightings).toHaveLength(1);
    expect(her.sightings[0]).toMatchObject({
      saw: "lame",
      instanceId: instance.id,
      seenBy: "test-owner",
      withdrawn: false,
    });
  });

  it("records what one round saw, however many times the phone sends it", async () => {
    const clock = new FakeClock("2027-04-02T02:00:00.000Z");
    const cow = await aCow(clock);
    const { owner, instance } = await walkThePen(clock);
    const phone = await createTestClient(appRouter, {
      as: "owner",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-sightings", name: "পরিদর্শন শেড ফোন" },
    });

    const batch = {
      key: `sightings-replay-${cow.tagNumber}`,
      entries: [
        {
          id: `look-${cow.tagNumber}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "step_completion" as const,
          instanceId: instance.id,
          stepId: "look",
          animalTag: cow.tagNumber,
          evidence: ["bulling"],
        },
      ],
    };
    const sent = await phone.client.sync.batch(batch);
    expect(await phone.client.sync.batch(batch)).toEqual(sent);

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.sightings.map((seen) => seen.saw)).toEqual(["bulling"]);
  });

  it("keeps what was said when a Correction says something else was seen", async () => {
    const clock = new FakeClock("2027-04-03T02:00:00.000Z");
    const cow = await aCow(clock);
    const { owner, instance } = await walkThePen(clock);
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "look",
      animalTag: cow.tagNumber,
      evidence: ["lame"],
    });
    const board = await owner.client.instances.get({ id: instance.id });
    const completionId =
      board.completions.find(
        (row) => row.stepId === "look" && row.animalId !== null
      )?.id ?? "";

    await owner.client.instances.correctStep({
      completionId,
      evidence: ["bulling"],
      reason: "খোঁড়াচ্ছিল না, গরমে ছিল",
    });

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    // Both are there: the one that stands, and the one somebody said on the round.
    expect(
      her.sightings.map((seen) => ({ saw: seen.saw, withdrawn: seen.withdrawn }))
    ).toEqual([
      { saw: "bulling", withdrawn: false },
      { saw: "lame", withdrawn: true },
    ]);
    const withdrawn = her.sightings.find((seen) => seen.withdrawn);
    const standing = her.sightings.find((seen) => !seen.withdrawn);
    expect(withdrawn?.supersededById).toBe(standing?.id);
  });

  it("withdraws it, and deletes nothing, when the Correction says nobody saw her", async () => {
    const clock = new FakeClock("2027-04-04T02:00:00.000Z");
    const cow = await aCow(clock);
    const { owner, instance } = await walkThePen(clock);
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "look",
      animalTag: cow.tagNumber,
      evidence: ["lame"],
    });
    const board = await owner.client.instances.get({ id: instance.id });
    const completionId =
      board.completions.find(
        (row) => row.stepId === "look" && row.animalId !== null
      )?.id ?? "";

    await owner.client.instances.correctStep({
      completionId,
      evidence: [],
      skipReason: "পশু পাওয়া যায়নি",
      reason: "ওই পশুটি সেদিন ছিল না",
    });

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.sightings).toHaveLength(1);
    expect(her.sightings[0]).toMatchObject({ saw: "lame", withdrawn: true });
  });
});
