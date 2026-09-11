import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** The feeding SOP: twice a day, one Step for the whole Pen, and the Step writes the Feeding. */
const feedingSop = (): SopContent => ({
  name: { bn: "খাওয়ানো", en: "Feeding" },
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

const setup = async () => {
  const manager = await createTestClient(appRouter, { as: "manager" });
  const shed = await manager.client.herd.createShed({
    name: `feeding-${Date.now()}`,
  });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "খাওয়ানোর পেন",
  });
  const concentrate = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${Date.now()}` },
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `খাওয়ানোর রেশন ${Date.now()}` },
    items: [{ feedItemId: concentrate.id, kgPerAnimalPerDay: 3 }],
  });
  await manager.client.feed.assignRation({
    penId: pen.id,
    rationId: ration.rationId,
  });
  const owner = await createTestClient(appRouter, { as: "owner" });
  const sop = await owner.client.sops.create({ content: feedingSop() });

  // The Staff member who does the round is assigned to this Pen, as they would be.
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-feeding-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  return { manager, pen, concentrate, ration, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const feedingDue = async (
  clock: FakeClock,
  { claim = true }: { claim?: boolean } = {}
) => {
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (row) => row.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected a feeding instance");
  }
  if (claim) {
    await owner.client.instances.claim({ id: instance.id });
  }
  return { owner, staff, instance };
};

describe("feeding a Pen", () => {
  it("arrives knowing what this Pen is owed, on the Ration and the herd standing in it", async () => {
    const clock = new FakeClock("2027-08-01T02:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    // Four cows into the Pen. Registered together: each takes the next Tag Number under a
    // row lock, so the farm hands out four of them whichever order they land in.
    await Promise.all(
      [0, 1, 2, 3].map(() =>
        manager.client.animals.register({
          sex: "female",
          side: "dairy",
          state: "heifer",
          penId: world.pen.id,
          source: "born",
          aliases: [],
        })
      )
    );

    const { owner, instance } = await feedingDue(clock);
    const board = await owner.client.instances.get({ id: instance.id });

    // Four animals, 3 kg each a day, fed twice: 6 kg this session.
    expect(board.feeding?.items).toEqual([
      {
        feedItemId: world.concentrate.id,
        nameBn: expect.stringContaining("দানাদার"),
        unit: "kg",
        kgPerAnimalPerDay: 3,
        quantity: 6,
      },
    ]);
    expect(board.feeding?.animals).toBe(4);
    expect(board.feeding?.sessionsPerDay).toBe(2);
  });

  const fedWith = async (
    clock: FakeClock,
    given: number,
    leftover?: number
  ) => {
    const { owner, instance } = await feedingDue(clock);
    await owner.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "feed",
      evidence: [true],
      feeding: [
        {
          feedItemId: world.concentrate.id,
          givenKg: given,
          ...(leftover === undefined ? {} : { leftoverKg: leftover }),
        },
      ],
    });
    return { owner, instance };
  };

  it("records what was given against what was owed, and says nothing when it adds up", async () => {
    const clock = new FakeClock("2027-08-02T02:00:00.000Z");
    const { owner, instance } = await fedWith(clock, 6);

    const board = await owner.client.instances.get({ id: instance.id });
    expect(board.fed).toMatchObject({
      shortfallPercent: 0,
      flaggedAt: null,
      animals: 4,
    });
    expect(board.fed?.lines).toEqual([
      {
        feedItemId: world.concentrate.id,
        targetKg: 6,
        givenKg: 6,
        leftoverKg: 0,
      },
    ]);
  });

  it("says so when a Pen came well under what it was owed", async () => {
    const clock = new FakeClock("2027-08-03T02:00:00.000Z");
    const { owner, instance } = await fedWith(clock, 3);

    const board = await owner.client.instances.get({ id: instance.id });
    // Half of what it was owed, against a farm tolerance of a tenth.
    expect(board.fed?.shortfallPercent).toBe(50);
    expect(board.fed?.flaggedAt).not.toBeNull();
  });

  it("counts what was left in the trough against what was eaten", async () => {
    const clock = new FakeClock("2027-08-04T02:00:00.000Z");
    const { owner, instance } = await fedWith(clock, 6, 3);

    const board = await owner.client.instances.get({ id: instance.id });
    // Everything was put out, and half of it came back: the Pen is off its feed, which is
    // exactly what the Manager needs to hear.
    expect(board.fed?.shortfallPercent).toBe(50);
    expect(board.fed?.flaggedAt).not.toBeNull();
  });

  it("feeds the Pen once however many times the phone sends the entry", async () => {
    const clock = new FakeClock("2027-08-05T02:00:00.000Z");
    const { owner, instance } = await feedingDue(clock, { claim: false });
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-feeding", name: "খাওয়ানোর শেড ফোন" },
    });
    // The phone takes the work, as the person doing the round would.
    await phone.client.instances.claim({ id: instance.id });

    const batch = {
      key: `feeding-replay-${instance.id}`,
      entries: [
        {
          id: `feed-${instance.id}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "step_completion" as const,
          instanceId: instance.id,
          stepId: "feed",
          evidence: [true],
          feeding: [{ feedItemId: world.concentrate.id, givenKg: 6 }],
        },
      ],
    };
    const sent = await phone.client.sync.batch(batch);
    expect(sent.results.map((row) => row.outcome)).toEqual(["applied"]);
    expect(await phone.client.sync.batch(batch)).toEqual(sent);

    const board = await owner.client.instances.get({ id: instance.id });
    // One meal, not two: the same entry twice is the same six kilos.
    expect(board.fed?.lines).toEqual([
      {
        feedItemId: world.concentrate.id,
        targetKg: 6,
        givenKg: 6,
        leftoverKg: 0,
      },
    ]);
  });

  it("rewrites the meal when a Correction says a different amount went out", async () => {
    const clock = new FakeClock("2027-08-06T02:00:00.000Z");
    const { owner, instance } = await fedWith(clock, 3);
    const board = await owner.client.instances.get({ id: instance.id });
    const completionId =
      board.completions.find((row) => row.stepId === "feed")?.id ?? "";

    await owner.client.instances.correctStep({
      completionId,
      evidence: [true],
      feeding: [{ feedItemId: world.concentrate.id, givenKg: 6 }],
      reason: "ওজন ভুল লেখা হয়েছিল",
    });

    const after = await owner.client.instances.get({ id: instance.id });
    expect(after.fed?.lines).toEqual([
      {
        feedItemId: world.concentrate.id,
        targetKg: 6,
        givenKg: 6,
        leftoverKg: 0,
      },
    ]);
    // And the flag the first entry raised is gone, because the meal is no longer short.
    expect(after.fed?.flaggedAt).toBeNull();
    expect(after.fed?.shortfallPercent).toBe(0);
  });

  it("will not let a Pen's feeding be skipped, because a Pen is not skipped one animal at a time", async () => {
    const clock = new FakeClock("2027-08-07T02:00:00.000Z");
    const { owner, instance } = await fedWith(clock, 6);
    const board = await owner.client.instances.get({ id: instance.id });
    const completionId =
      board.completions.find((row) => row.stepId === "feed")?.id ?? "";

    // A meal that did not happen is the Manager closing the work as Missed, with a reason —
    // not a Step quietly marked skipped and a Feeding left standing beside it.
    await expect(
      owner.client.instances.correctStep({
        completionId,
        evidence: [],
        skipReason: "খাবার শেষ হয়ে গিয়েছিল",
        reason: "ওই বেলা খাওয়ানো হয়নি",
      })
    ).rejects.toThrow(/per-animal step can be skipped/u);

    const after = await owner.client.instances.get({ id: instance.id });
    expect(after.fed).not.toBeNull();
  });

  it("divides by the schedule that raised the work, not by whichever was written first", async () => {
    // A second feeding routine, at three times a day, on the same Pen.
    const clock = new FakeClock("2027-08-08T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const thrice = await owner.client.sops.create({
      content: {
        ...feedingSop(),
        name: { bn: `তিনবেলা ${Date.now()}`, en: "Three times" },
        triggers: [{ kind: "schedule", times: ["05:00", "12:00", "19:00"] }],
      },
    });
    await owner.client.instances.ensureDue();
    const today = await owner.client.instances.today({ penId: world.pen.id });
    const instance = today.find(
      (row) => row.definitionId === thrice.definitionId
    );
    if (!instance) {
      throw new Error("expected the three-times instance");
    }
    await owner.client.instances.claim({ id: instance.id });

    const board = await owner.client.instances.get({ id: instance.id });
    // Four animals, 3 kg each a day, fed three times: 4 kg this session, not 6.
    expect(board.feeding?.sessionsPerDay).toBe(3);
    expect(board.feeding?.items[0]?.quantity).toBe(4);
  });
});
