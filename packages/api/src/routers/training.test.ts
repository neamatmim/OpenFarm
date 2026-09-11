import type { SopContent } from "@OpenFarm/domain";
import { DAY, FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const cleaningSop = (): SopContent => ({
  name: { bn: "শেড পরিষ্কার", en: "Shed cleaning" },
  purpose: { bn: "প্রতিদিন শেড ধুয়ে পরিষ্কার রাখুন" },
  triggers: [{ kind: "schedule", times: ["09:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "sweep",
      text: { bn: "মেঝে ঝাড়ু দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const sop = await owner.client.sops.create({ content: cleaningSop() });
  await createTestClient(appRouter, { as: "staff" });
  return { owner, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

describe("the card on the shed wall", () => {
  it("is the published Version, and says which one it is", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    const card = await manager.client.sops.card({
      definitionId: world.sop.definitionId,
    });

    expect(card.name.bn).toBe("শেড পরিষ্কার");
    expect(card.purpose.bn).toBe("প্রতিদিন শেড ধুয়ে পরিষ্কার রাখুন");
    expect(card.number).toBe(1);
    expect(card.publishedAt).toBeInstanceOf(Date);
    expect(card.steps.map((step) => step.text.bn)).toEqual(["মেঝে ঝাড়ু দিন"]);
  });
});

describe("who knew which procedure", () => {
  it("records that a person was trained on a Version, and shows it on both sides", async () => {
    const clock = new FakeClock("2027-09-01T02:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    await manager.client.sops.recordTraining({
      userId: "test-staff",
      versionId: world.sop.versionId,
    });

    const onTheSop = await manager.client.sops.training({
      definitionId: world.sop.definitionId,
    });
    expect(onTheSop).toContainEqual(
      expect.objectContaining({
        userId: "test-staff",
        versionNumber: 1,
        trainedBy: "test-manager",
      })
    );

    const person = await manager.client.people.get({ userId: "test-staff" });
    expect(person.training).toContainEqual(
      expect.objectContaining({
        definitionId: world.sop.definitionId,
        versionNumber: 1,
      })
    );
  });

  it("records a second training rather than moving the first", async () => {
    const clock = new FakeClock("2027-09-02T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    // The Owner changes the procedure, and the person is trained again on what changed.
    const published = await owner.client.sops.publish({
      definitionId: world.sop.definitionId,
      content: {
        ...cleaningSop(),
        steps: [
          ...cleaningSop().steps,
          {
            id: "disinfect",
            text: { bn: "জীবাণুনাশক দিন" },
            repeatPerAnimal: false,
            evidence: [{ type: "tick", required: true }],
            skipReasons: [],
          },
        ],
      },
      note: "জীবাণুনাশক যোগ করা হয়েছে",
    });
    clock.advance(DAY);
    await manager.client.sops.recordTraining({
      userId: "test-staff",
      versionId: published.versionId,
    });

    const onTheSop = await manager.client.sops.training({
      definitionId: world.sop.definitionId,
    });
    const mine = onTheSop.filter((row) => row.userId === "test-staff");
    // Both stand: what somebody was taught in September is not undone by October.
    expect(mine.map((row) => row.versionNumber).toSorted()).toEqual([1, 2]);
  });
});
