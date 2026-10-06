import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, HOUR } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// A Feeding is what the Pen was given as it stood when it was fed: the Ration in force when the work was raised, the
// animals standing in it then — whatever the Pen has become by the time the entry lands or is put right. And what is
// left in the trough is found at the next feed, and is the last feed's.

const suffix = `as-it-was-${Date.now()}`;

const feedingSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেনের পশুদের রেশন অনুযায়ী খাওয়ান" },
  triggers: [{ kind: "schedule", times: ["06:00", "17:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "feed",
      text: { bn: "রেশন অনুযায়ী খাওয়ান" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

const world = {
  concentrate: "",
  hay: "",
  onConcentrate: "",
  onHay: "",
  definitionId: "",
};

const at = (instant: string, role: "owner" | "manager" = "owner") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const manager = await at("2037-01-01T00:00:00.000Z", "manager");
  const concentrate = await manager.client.feed.items.create({
    name: { bn: `দানাদার ${suffix}` },
  });
  const hay = await manager.client.feed.items.create({
    name: { bn: `খড় ${suffix}` },
  });
  const onConcentrate = await manager.client.feed.rations.save({
    name: { bn: `দানাদারের রেশন ${suffix}` },
    items: [{ feedItemId: concentrate.id, kgPerAnimalPerDay: 3 }],
  });
  const onHay = await manager.client.feed.rations.save({
    name: { bn: `খড়ের রেশন ${suffix}` },
    items: [{ feedItemId: hay.id, kgPerAnimalPerDay: 5 }],
  });
  const owner = await at("2037-01-01T00:00:00.000Z");
  const sop = await owner.client.sops.create({ content: feedingSop() });
  Object.assign(world, {
    concentrate: concentrate.id,
    hay: hay.id,
    onConcentrate: onConcentrate.rationId,
    onHay: onHay.rationId,
    definitionId: sop.definitionId,
  });
});

const addHeifers = async (instant: string, penId: string, head: number) => {
  const manager = await at(instant, "manager");
  for (let one = 0; one < head; one += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one Tag Number after another
    await manager.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
      source: "born",
      aliases: [],
    });
  }
};

/** A Pen of `head` heifers on the concentrate Ration, from `instant`. */
const aPen = async (instant: string, head = 4) => {
  const manager = await at(instant, "manager");
  const shed = await manager.client.sheds.create({
    name: `${suffix}-${instant}`,
  });
  const pen = await manager.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${instant}`,
  });
  await manager.client.feed.rations.assign({
    penId: pen.id,
    rationId: world.onConcentrate,
  });
  await addHeifers(instant, pen.id, head);
  return pen.id;
};

/** The feeding work raised for the Pen at `instant`, claimed. */
const feedingWork = async (instant: string, penId: string) => {
  const owner = await at(instant);
  await owner.client.work.ensureDue();
  const today = await owner.client.work.today({ penId });
  const work = today.find(
    (row) => row.definitionId === world.definitionId && row.state === "due"
  );
  if (!work) {
    throw new Error("expected the feeding work");
  }
  await owner.client.work.claim({ id: work.id });
  return work.id;
};

const fed = async (
  instant: string,
  workId: string,
  lines: { feedItemId: string; givenKg: number; leftoverKg?: number }[]
) => {
  const owner = await at(instant);
  await owner.client.work.completeStep({
    instanceId: workId,
    stepId: "feed",
    evidence: [true],
    feeding: lines,
  });
  const board = await owner.client.work.get({ id: workId });
  return {
    owner,
    completionId:
      board.completions.find((row) => row.stepId === "feed")?.id ?? "",
  };
};

const fedOf = async (workId: string) => {
  const owner = await at("2037-06-01T00:00:00.000Z");
  const board = await owner.client.work.get({ id: workId });
  return board.fed;
};

describe("a Feeding put right", () => {
  it("keeps the meal it was, though the Pen is on another Ration now", async () => {
    const penId = await aPen("2037-01-02T00:00:00.000Z");
    const work = await feedingWork("2037-01-03T00:30:00.000Z", penId);
    const { owner, completionId } = await fed(
      "2037-01-03T00:40:00.000Z",
      work,
      [{ feedItemId: world.concentrate, givenKg: 6 }]
    );
    const manager = await at("2037-01-05T00:00:00.000Z", "manager");
    await manager.client.feed.rations.assign({ penId, rationId: world.onHay });

    await correctStepAsShown(owner.client, {
      completionId,
      evidence: [true],
      feeding: [{ feedItemId: world.concentrate, givenKg: 5 }],
      reason: "পাঁচ কেজি দেওয়া হয়েছিল",
    });
    const after = await fedOf(work);
    expect(after?.lines).toEqual([
      expect.objectContaining({
        feedItemId: world.concentrate,
        givenKg: 5,
        targetKg: 6,
      }),
    ]);
  });

  it("keeps the herd it was fed for, though more have come into the Pen since", async () => {
    const penId = await aPen("2037-01-10T00:00:00.000Z");
    const work = await feedingWork("2037-01-11T00:30:00.000Z", penId);
    const { owner, completionId } = await fed(
      "2037-01-11T00:40:00.000Z",
      work,
      [{ feedItemId: world.concentrate, givenKg: 6 }]
    );
    await addHeifers("2037-01-12T00:00:00.000Z", penId, 4);

    await correctStepAsShown(owner.client, {
      completionId,
      evidence: [true],
      feeding: [{ feedItemId: world.concentrate, givenKg: 5.5 }],
      reason: "সাড়ে পাঁচ কেজি",
    });
    const after = await fedOf(work);
    expect(after).toMatchObject({ animals: 4, flaggedAt: null });
  });
});

describe("a Feeding that lands late", () => {
  it("is set against the animals standing when they were fed, not when the phone found signal", async () => {
    const penId = await aPen("2037-01-20T00:00:00.000Z");
    const work = await feedingWork("2037-01-21T00:30:00.000Z", penId);
    // Four more at noon; the morning's feeding reaches the farm in the evening.
    await addHeifers("2037-01-21T06:00:00.000Z", penId, 4);
    const phone = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2037-01-21T12:00:00.000Z"),
    });
    await phone.client.sync.batch({
      key: `late-feed-${penId}`,
      entries: [
        {
          id: `late-feed-entry-${penId}`,
          seq: 1,
          recordedAt: new Date("2037-01-21T00:40:00.000Z"),
          kind: "step_completion" as const,
          instanceId: work,
          stepId: "feed",
          evidence: [true],
          feeding: [{ feedItemId: world.concentrate, givenKg: 6 }],
        },
      ],
    });
    const after = await fedOf(work);
    expect(after).toMatchObject({ animals: 4, flaggedAt: null });
  });

  it("is fed on the Ration in force when its work was raised", async () => {
    const penId = await aPen("2037-01-25T00:00:00.000Z");
    const work = await feedingWork("2037-01-26T00:30:00.000Z", penId);
    // An hour after the round was raised, the Pen goes onto hay; the round was fed concentrate.
    const manager = await at("2037-01-26T00:35:00.000Z", "manager");
    await manager.client.feed.rations.assign({ penId, rationId: world.onHay });
    await fed("2037-01-26T00:50:00.000Z", work, [
      { feedItemId: world.concentrate, givenKg: 6 },
    ]);
    const after = await fedOf(work);
    expect(after?.lines).toEqual([
      expect.objectContaining({ feedItemId: world.concentrate, givenKg: 6 }),
    ]);
  });
});

describe("what was left in the trough", () => {
  it("is found at the next feed, and is the last feed's", async () => {
    const penId = await aPen("2037-02-01T00:00:00.000Z");
    const morning = await feedingWork("2037-02-02T00:30:00.000Z", penId);
    await fed("2037-02-02T00:40:00.000Z", morning, [
      { feedItemId: world.concentrate, givenKg: 6 },
    ]);
    const evening = await feedingWork(
      new Date(
        new Date("2037-02-02T11:00:00.000Z").getTime() + HOUR / 2
      ).toISOString(),
      penId
    );
    // Two of the morning's six were still in the trough when the evening's went in.
    await fed("2037-02-02T11:40:00.000Z", evening, [
      { feedItemId: world.concentrate, givenKg: 6, leftoverKg: 2 },
    ]);
    const morningFed = await fedOf(morning);
    expect(morningFed?.lines).toEqual([
      expect.objectContaining({ givenKg: 6, leftoverKg: 2 }),
    ]);
    const eveningFed = await fedOf(evening);
    expect(eveningFed?.lines).toEqual([
      expect.objectContaining({ givenKg: 6, leftoverKg: 0 }),
    ]);
  });
});
