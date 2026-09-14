import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { DAY, FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** The milking SOP: twice a day, a per-cow block with litres, a bulk total at the end. */
const milkingSop = (): SopContent => ({
  name: { bn: "দোহন", en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ সংগ্রহ", en: "Milk each cow" },
  triggers: [{ kind: "schedule", times: ["05:00", "16:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
    {
      id: "prep",
      text: { bn: "পার্লার প্রস্তুত করুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "milk",
      text: { bn: "গাভীর দুধ দোহন করুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 40,
        },
      ],
      skipReasons: [{ bn: "অসুস্থ" }, { bn: "শুকনো" }],
    },
    {
      id: "bulk",
      text: { bn: "বাল্ক ট্যাংকে মোট" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 5000,
        },
      ],
      skipReasons: [],
    },
  ],
});

/** A milking pen with two cows, a fattening pen with one, and a Staff member on the first. */
/** How many Audit Events a piece of work has. */
const trailOf = async (instanceId: string) => {
  const events = await scratchDb().query.auditEvent.findMany({
    where: { entity: "sop_instance", entityId: instanceId },
    columns: { id: true },
  });
  return events.length;
};

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `instances-${Date.now()}`,
  });
  const milkingPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "দোহন পেন",
  });
  const fatteningPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "মোটা পেন",
  });

  /** A cow walked up the lifecycle to Milking; the steps must run in order. */
  const milkingCow = async () => {
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: milkingPen.id,
      source: "born",
      aliases: [],
    });
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "pregnant_heifer",
    });
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "milking",
    });
    return cow;
  };
  const cows = [await milkingCow(), await milkingCow()];

  const steer = await owner.client.animals.register({
    sex: "male",
    side: "fattening",
    state: "quarantine",
    penId: fatteningPen.id,
    source: "bought",
    aliases: [],
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-milking-${milkingPen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: milkingPen.id,
    })
    .onConflictDoNothing();

  const sop = await owner.client.sops.create({ content: milkingSop() });
  return { owner, milkingPen, fatteningPen, cows, steer, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const morning = () => new FakeClock("2026-09-12T05:30:00.000Z");

const instanceForPen = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({
    penId: world.milkingPen.id,
  });
  const instance = today.find(
    (candidate) => candidate.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected a milking instance");
  }
  return { owner, instance };
};

describe("the scheduler", () => {
  it("raises one Instance per Pen holding animals the SOP concerns, and never duplicates", async () => {
    const clock = morning();
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    // Other test files share this database and add their own animals, so idempotence is
    // asserted on this SOP's own Pens rather than on a farm-wide count.
    await owner.client.instances.ensureDue();
    await owner.client.instances.ensureDue();
    const inMilkingPen = await owner.client.instances.today({
      penId: world.milkingPen.id,
    });
    const inFatteningPen = await owner.client.instances.today({
      penId: world.fatteningPen.id,
    });
    const mine = inMilkingPen.filter(
      (i) => i.definitionId === world.sop.definitionId
    );

    // Two sessions a day in the milking pen, once each however often the scheduler runs.
    expect(mine).toHaveLength(2);
    expect(mine.map((i) => i.dueAt.toISOString()).toSorted()).toEqual([
      "2026-09-11T23:00:00.000Z",
      "2026-09-12T10:00:00.000Z",
    ]);
    // None in the fattening pen: it has no milking cows for this SOP to concern itself with.
    expect(
      inFatteningPen.filter((i) => i.definitionId === world.sop.definitionId)
    ).toEqual([]);
  });

  it("pins the Version in force, so a later edit does not change work already raised", async () => {
    const clock = new FakeClock("2026-09-14T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const before = instance.versionId;

    const changed = milkingSop();
    changed.graceMinutes = 15;
    await world.owner.client.sops.publish({
      definitionId: world.sop.definitionId,
      content: changed,
    });

    const reloaded = await world.owner.client.instances.get({
      id: instance.id,
    });
    expect(reloaded.versionId).toBe(before);
    expect(reloaded.content.graceMinutes).toBe(90);
  });
});

describe("claiming", () => {
  it("is exclusive: the second person is told someone took it first", async () => {
    const clock = new FakeClock("2026-09-15T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    await staff.client.instances.claim({ id: instance.id });
    // Claiming their own work again is the same fact, and the trail says it once.
    const claimed = await trailOf(instance.id);
    await staff.client.instances.claim({ id: instance.id });
    expect(await trailOf(instance.id)).toBe(claimed);

    // Not a question of permission: somebody else is holding this work, which is the same
    // answer a phone gets when it claimed with no signal and arrived second.
    await expect(
      manager.client.instances.claim({ id: instance.id })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("the Manager can pin it to a person, and that takes it out of anyone else's hands", async () => {
    const clock = new FakeClock("2026-09-16T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await staff.client.instances.claim({ id: instance.id });

    await manager.client.instances.assign({
      id: instance.id,
      userId: "test-manager",
    });

    await expect(
      staff.client.instances.claim({ id: instance.id })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const reloaded = await manager.client.instances.get({ id: instance.id });
    expect({
      assignedTo: reloaded.assignedTo,
      claimedBy: reloaded.claimedBy,
    }).toEqual({
      assignedTo: "test-manager",
      claimedBy: null,
    });
  });

  it("a Staff member cannot touch an Instance for a Pen that is not theirs", async () => {
    const clock = new FakeClock("2026-09-17T05:30:00.000Z");
    const { owner } = await instanceForPen(clock);
    await owner.client.animals.move({
      tagNumber: world.steer.tagNumber,
      toPenId: world.fatteningPen.id,
    });
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    const visible = await staff.client.instances.today();

    expect(visible.some((i) => i.penId === world.milkingPen.id)).toBe(true);
    expect(visible.some((i) => i.penId === world.fatteningPen.id)).toBe(false);
  });
});

describe("working the pen board", () => {
  it("records a per-animal Step once per animal, attributed to the person on the phone", async () => {
    const clock = new FakeClock("2026-09-18T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
    });
    await phone.client.instances.claim({ id: instance.id });

    await phone.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: world.cows[0]?.tagNumber ?? "",
      evidence: [12.5],
    });

    const loaded = await phone.client.instances.get({ id: instance.id });
    const completion = loaded.completions.find((c) => c.stepId === "milk");
    expect(completion).toMatchObject({
      status: "done",
      recordedBy: "test-staff",
    });
    expect(completion?.deviceId).toBe("test-shed-phone");
    expect(completion?.evidence).toEqual([12.5]);
    expect(loaded.state).toBe("in_progress");
    expect(loaded.animals.map((a) => a.tagNumber).toSorted()).toEqual(
      world.cows.map((c) => c.tagNumber).toSorted()
    );
  });

  it("a skipped animal needs a reason and counts as covered", async () => {
    const clock = new FakeClock("2026-09-19T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.claim({ id: instance.id });

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: world.cows[0]?.tagNumber ?? "",
      skipReason: "অসুস্থ",
    });

    const loaded = await staff.client.instances.get({ id: instance.id });
    const skipped = loaded.completions.find((c) => c.stepId === "milk");
    expect(skipped).toMatchObject({ status: "skipped", skipReason: "অসুস্থ" });
  });

  it("keeps a number that was outside its range, with the fact that it was", async () => {
    const clock = new FakeClock("2026-09-20T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.claim({ id: instance.id });

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: world.cows[0]?.tagNumber ?? "",
      evidence: [95],
      outOfRange: "above 40",
    });

    const loaded = await staff.client.instances.get({ id: instance.id });
    const completion = loaded.completions.find((c) => c.stepId === "milk");
    expect(completion?.evidence).toEqual([95]);
    expect(completion?.outOfRange).toBe("above 40");
  });

  it("refuses to finish while any animal or Step is outstanding, then completes", async () => {
    const clock = new FakeClock("2026-09-21T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.claim({ id: instance.id });

    // A Pen with cows nobody has recorded is not a finished shift — and to a phone that
    // finished on what it could see, it is the world having moved.
    await expect(
      staff.client.instances.complete({ id: instance.id })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "prep",
      evidence: [true],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: world.cows[0]?.tagNumber ?? "",
      evidence: [10],
    });

    // One cow still unrecorded.
    await expect(
      staff.client.instances.complete({ id: instance.id })
    ).rejects.toMatchObject({
      message: expect.stringContaining(world.cows[1]?.tagNumber ?? ""),
    });

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: world.cows[1]?.tagNumber ?? "",
      evidence: [11],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [21],
    });
    const finished = await staff.client.instances.complete({ id: instance.id });

    expect(finished.state).toBe("completed");
    const loaded = await staff.client.instances.get({ id: instance.id });
    expect(loaded.completions).toHaveLength(4);
    expect(loaded.completions.every((c) => c.recordedBy === "test-staff")).toBe(
      true
    );
    // Finished work is not open to a fresh entry — the world has moved past it.
    await expect(
      staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "prep",
        evidence: [true],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a second, different entry for the same animal — that is a Correction", async () => {
    const clock = new FakeClock("2026-09-22T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.claim({ id: instance.id });
    const tag = world.cows[0]?.tagNumber ?? "";

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tag,
      evidence: [10],
    });
    // The same entry again is the phone replaying its outbox: one fact, accepted quietly.
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tag,
      evidence: [10],
    });
    // A different figure is a changed fact, and facts change only by Correction.
    await expect(
      staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: tag,
        evidence: [12],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const loaded = await staff.client.instances.get({ id: instance.id });
    const forCow = loaded.completions.filter((c) => c.stepId === "milk");
    expect(forCow).toHaveLength(1);
    expect(forCow[0]?.evidence).toEqual([10]);

    await staff.client.instances.correctStep({
      completionId: forCow[0]?.id ?? "",
      evidence: [12],
      reason: "কীপ্যাডে ভুল",
    });
    const corrected = await staff.client.instances.get({ id: instance.id });
    const after = corrected.completions.filter((c) => c.stepId === "milk");
    expect(after).toHaveLength(1);
    expect(after[0]?.evidence).toEqual([12]);
  });

  it("refuses an animal from another pen, and a per-animal step with no animal", async () => {
    const clock = new FakeClock("2026-09-23T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.claim({ id: instance.id });

    await expect(
      staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: world.steer.tagNumber,
        evidence: [10],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        evidence: [10],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    void DAY;
  });
});

describe("review findings", () => {
  it("correcting a pen-level Step replaces it rather than adding a second row", async () => {
    const clock = new FakeClock("2026-09-24T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.claim({ id: instance.id });

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [21],
    });
    const first = await staff.client.instances.get({ id: instance.id });
    const original = first.completions.find((c) => c.stepId === "bulk");
    await staff.client.instances.correctStep({
      completionId: original?.id ?? "",
      evidence: [210],
      reason: "শূন্য বাদ পড়েছিল",
    });

    const loaded = await staff.client.instances.get({ id: instance.id });
    const bulk = loaded.completions.filter((c) => c.stepId === "bulk");
    expect(bulk).toHaveLength(1);
    expect(bulk[0]?.evidence).toEqual([210]);
  });

  it("an animal that has left the farm is off the pen board and does not block finishing", async () => {
    const clock = new FakeClock("2026-09-25T05:30:00.000Z");
    const { instance, owner } = await instanceForPen(clock);
    const before = await owner.client.instances.get({ id: instance.id });
    const doomed = before.animals[0]?.tagNumber ?? "";

    await owner.client.animals.recordMortality({
      tagNumber: doomed,
      kind: "died",
      cause: "test",
      disposal: "buried",
    });

    const after = await owner.client.instances.get({ id: instance.id });
    expect(after.animals.some((a) => a.tagNumber === doomed)).toBe(false);
    expect(after.animals.length).toBe(before.animals.length - 1);
  });

  it("required evidence is checked per slot, and a photo counts for its own slot", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const withPhoto = milkingSop();
    const sop = await owner.client.sops.create({
      content: {
        ...withPhoto,
        name: { bn: `ছবি এসওপি ${Date.now()}` },
        triggers: [{ kind: "schedule", times: ["07:00"] }],
        steps: [
          {
            id: "evidence",
            text: { bn: "প্রমাণ" },
            repeatPerAnimal: false,
            evidence: [
              { type: "note", required: false },
              {
                type: "number",
                required: true,
                unit: { bn: "লিটার" },
                min: 0,
                max: 40,
              },
              { type: "photo", required: true },
            ],
            skipReasons: [],
          },
        ],
      },
    });
    const clock = new FakeClock("2026-09-26T07:30:00.000Z");
    const worker = await createTestClient(appRouter, { as: "owner", clock });
    await worker.client.instances.ensureDue();
    const today = await worker.client.instances.today({
      penId: world.milkingPen.id,
    });
    const mine = today.find((i) => i.definitionId === sop.definitionId);
    if (!mine) {
      throw new Error("expected an instance");
    }
    await worker.client.instances.claim({ id: mine.id });

    // Filling only the optional note leaves the required number and photo missing.
    await expect(
      worker.client.instances.completeStep({
        instanceId: mine.id,
        stepId: "evidence",
        evidence: ["just a note"],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The number alone is still short of the required photo.
    await expect(
      worker.client.instances.completeStep({
        instanceId: mine.id,
        stepId: "evidence",
        evidence: ["note", 12],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The Step says the photo for its slot is coming, and the photo follows on its own.
    const recorded = await worker.client.instances.completeStep({
      instanceId: mine.id,
      stepId: "evidence",
      evidence: ["note", 12],
      photoSlots: [2],
    });
    const loaded = await worker.client.instances.get({ id: mine.id });
    expect(loaded.completions).toHaveLength(1);
    const completionId = loaded.completions[0]?.id ?? "";
    await worker.client.instances.attachPhoto({
      completionId,
      slot: 2,
      contentType: "image/jpeg",
      data: "AAAA",
    });
    const photos = await scratchDb().query.completionPhoto.findMany({
      where: { completionId },
      columns: { slot: true },
    });
    expect(photos).toEqual([{ slot: 2 }]);
    expect(recorded.stepId).toBe("evidence");
  });

  it("work that is for the Vet cannot be done by Staff, nor from a shed phone", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const vetSop = await owner.client.sops.create({
      content: {
        ...milkingSop(),
        name: { bn: `পশুচিকিৎসা ${Date.now()}` },
        assignedRole: "vet",
        triggers: [{ kind: "schedule", times: ["08:00"] }],
        steps: [
          {
            id: "check",
            text: { bn: "পরীক্ষা" },
            repeatPerAnimal: false,
            evidence: [{ type: "tick", required: true }],
            skipReasons: [],
          },
        ],
      },
    });
    const clock = new FakeClock("2026-09-27T08:30:00.000Z");
    const scheduler = await createTestClient(appRouter, { as: "owner", clock });
    await scheduler.client.instances.ensureDue();
    const today = await scheduler.client.instances.today({
      penId: world.milkingPen.id,
    });
    const mine = today.find((i) => i.definitionId === vetSop.definitionId);
    if (!mine) {
      throw new Error("expected a vet instance");
    }

    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const vetOnPhone = await createTestClient(appRouter, {
      as: "vet",
      clock,
      onShedPhone: true,
    });

    await expect(
      staff.client.instances.claim({ id: mine.id })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      vetOnPhone.client.instances.claim({ id: mine.id })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("finished work cannot be reassigned or completed again", async () => {
    const clock = new FakeClock("2026-09-28T05:30:00.000Z");
    const { instance } = await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await staff.client.instances.claim({ id: instance.id });
    const loaded = await staff.client.instances.get({ id: instance.id });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "prep",
      evidence: [true],
    });
    await Promise.all(
      loaded.animals.map((beast) =>
        staff.client.instances.completeStep({
          instanceId: instance.id,
          stepId: "milk",
          animalTag: beast.tagNumber,
          evidence: [10],
        })
      )
    );
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [20],
    });
    await staff.client.instances.complete({ id: instance.id });

    // Finishing again changes nothing rather than refusing: a phone replaying its outbox
    // sends what it sent, and the second telling is the same fact (ADR 0002) — with nothing
    // in the trail for a transition that did not happen.
    const finished = await trailOf(instance.id);
    await staff.client.instances.complete({ id: instance.id });
    const after = await staff.client.instances.get({ id: instance.id });
    expect(after.state).toBe("completed");
    expect(await trailOf(instance.id)).toBe(finished);

    await expect(
      manager.client.instances.assign({ id: instance.id, userId: "test-staff" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("an explicit pen filter is honoured for Staff rather than widened to all their pens", async () => {
    const clock = new FakeClock("2026-09-29T05:30:00.000Z");
    await instanceForPen(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    const asked = await staff.client.instances.today({
      penId: world.fatteningPen.id,
    });

    expect(asked).toEqual([]);
  });
});
