import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const waterSop = (): SopContent => ({
  name: { bn: "পানি দিন", en: "Water" },
  purpose: { bn: "প্রতিটি পেনে পানি আছে কিনা দেখুন" },
  triggers: [{ kind: "schedule", times: ["08:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "check",
      text: { bn: "চাড়ি ভরা আছে" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `changes-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "পানির পেন",
  });
  await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const sop = await owner.client.sops.create({ content: waterSop() });
  return { owner, pen, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const openWork = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (row) => row.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected the water instance");
  }
  return { owner, instance };
};

describe("a Version that changed under somebody", () => {
  it("tells the people who do the work, without buzzing a pocket at midnight", async () => {
    const clock = new FakeClock("2027-11-01T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    await owner.client.sops.publish({
      definitionId: world.sop.definitionId,
      content: {
        ...waterSop(),
        steps: [
          ...waterSop().steps,
          {
            id: "scrub",
            text: { bn: "চাড়ি ঘষে পরিষ্কার করুন" },
            repeatPerAnimal: false,
            evidence: [{ type: "tick", required: true }],
            skipReasons: [],
          },
        ],
      },
      note: "চাড়ি পরিষ্কারের ধাপ যোগ",
    });

    const mine = await staff.client.alerts.mine({});
    expect(mine).toContainEqual(
      expect.objectContaining({ kind: "sop_published" })
    );
  });

  it("says what changed, in words, the first time somebody opens the work", async () => {
    const clock = new FakeClock("2027-11-02T02:00:00.000Z");
    const { owner, instance } = await openWork(clock);

    const board = await owner.client.instances.get({ id: instance.id });
    expect(board.changed?.from).toBe(1);
    expect(board.changed?.to).toBe(2);
    expect(board.changed?.changes).toContainEqual({
      kind: "step_added",
      step: "চাড়ি ঘষে পরিষ্কার করুন",
    });
  });

  it("stops saying it once they have done the work on that Version", async () => {
    const clock = new FakeClock("2027-11-03T02:00:00.000Z");
    const { owner, instance } = await openWork(clock);

    const before = await owner.client.instances.get({ id: instance.id });
    expect(before.changed).not.toBeNull();

    await owner.client.instances.claim({ id: instance.id });
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "check",
      evidence: [true],
    });

    const after = await owner.client.instances.get({ id: instance.id });
    // They have done it on this Version, which is how the farm knows they read it. No
    // button to press, and nothing left nagging.
    expect(after.changed).toBeNull();
  });

  it("leaves work already in hand on the Version it started on, and says which", async () => {
    const clock = new FakeClock("2027-11-04T02:00:00.000Z");
    const { owner, instance } = await openWork(clock);
    const startedOn = instance.versionId;

    // The Owner changes the procedure while the morning's work is already raised.
    const owner2 = await createTestClient(appRouter, { as: "owner", clock });
    const published = await owner2.client.sops.publish({
      definitionId: world.sop.definitionId,
      content: {
        ...waterSop(),
        steps: [
          {
            id: "check",
            text: { bn: "চাড়ি ভরা আছে" },
            repeatPerAnimal: false,
            evidence: [{ type: "tick", required: true }],
            skipReasons: [],
          },
          {
            id: "rinse",
            text: { bn: "চাড়ি ধুয়ে নিন" },
            repeatPerAnimal: false,
            evidence: [{ type: "tick", required: true }],
            skipReasons: [],
          },
        ],
      },
      note: "ধোয়ার ধাপ",
    });

    const board = await owner.client.instances.get({ id: instance.id });
    // The work in hand is still the work that was raised: same Version, same Steps (ADR
    // 0001), and the newer one is not quietly swapped under the person doing it.
    expect(board.versionId).toBe(startedOn);
    expect(board.versionId).not.toBe(published.versionId);
    expect(board.content.steps.map((step) => step.id)).not.toContain("rinse");
  });
});
