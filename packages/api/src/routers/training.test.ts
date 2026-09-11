import type { SopContent } from "@OpenFarm/domain";
import { DAY, FakeClock, scratchDb } from "@OpenFarm/test-harness";
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

  it("writes an Audit Event for the teaching, and none at all for a repeat", async () => {
    const clock = new FakeClock("2027-09-03T02:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const sop = await owner.client.sops.create({
      content: { ...cleaningSop(), name: { bn: `ধোয়া ${Date.now()}` } },
    });

    const first = await manager.client.sops.recordTraining({
      userId: "test-staff",
      versionId: sop.versionId,
    });
    expect(first.taught).toBe(true);

    const again = await manager.client.sops.recordTraining({
      userId: "test-staff",
      versionId: sop.versionId,
    });
    // Nothing changed, so nothing is written — least of all a trail saying something did.
    expect(again).toMatchObject({ id: first.id, taught: false });

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "sop_training", entityId: first.id },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual(["create"]);
    expect(events[0]?.after).toMatchObject({ userId: "test-staff" });
  });

  it("will not mark somebody who does not work on this farm", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    await expect(
      manager.client.sops.recordTraining({
        userId: "somebody-else-entirely",
        versionId: world.sop.versionId,
      })
    ).rejects.toThrow(/does not work on this farm|somebody who works/u);
  });

  it("answers what somebody had been taught as of a day", async () => {
    const clock = new FakeClock("2027-10-01T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const sop = await owner.client.sops.create({
      content: { ...cleaningSop(), name: { bn: `মোছা ${Date.now()}` } },
    });
    const askedAbout = clock.now();

    // Taught a week after the day somebody is asking about. A fresh client, because a
    // session does not stay signed in across a week of the farm's clock.
    clock.advance(7 * DAY);
    const later = await createTestClient(appRouter, { as: "manager", clock });
    await later.client.sops.recordTraining({
      userId: "test-staff",
      versionId: sop.versionId,
    });

    const onTheDay = await later.client.sops.training({
      definitionId: sop.definitionId,
      asOf: askedAbout,
    });
    expect(onTheDay).toEqual([]);

    const now = await later.client.sops.training({
      definitionId: sop.definitionId,
    });
    expect(now).toHaveLength(1);
  });
});
