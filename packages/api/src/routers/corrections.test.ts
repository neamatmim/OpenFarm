import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  HOUR,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

/** The milking SOP, so a Correction has an effect to re-run and a tank to reconcile. */
const milkingSop = (over: Partial<SopContent> = {}): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
    {
      id: "milk",
      text: { bn: "দোহন করুন" },
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
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "milk_record" },
    },
    {
      id: "bulk",
      text: { bn: "ট্যাংকে মোট" },
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
      effect: { kind: "bulk_total" },
    },
  ],
  ...over,
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: `corr-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });

  const milkingCow = async () => {
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
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

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-corr-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();

  const sop = await owner.client.sops.create({ content: milkingSop() });
  const vetSop = await owner.client.sops.create({
    content: milkingSop({
      name: { bn: `পশু পরীক্ষা ${suffix}` },
      assignedRole: "vet",
      checkerRole: null,
      triggers: [{ kind: "schedule", times: ["08:00"] }],
      steps: [
        {
          id: "check",
          text: { bn: "পরীক্ষা" },
          repeatPerAnimal: false,
          evidence: [{ type: "note", required: true }],
          skipReasons: [],
        },
      ],
    }),
  });
  return { owner, pen, cows, sop, vetSop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

type Role = "owner" | "manager" | "staff" | "vet";

const as = async (role: Role, clock: FakeClock) => {
  const made = await createTestClient(appRouter, { as: role, clock });
  return made.client;
};

/** A claimed Instance of the milking SOP on its own day. */
const session = async (day: string, definitionId = world.sop.definitionId) => {
  const clock = new FakeClock(`${day}T05:30:00.000Z`);
  const scheduler = await as("owner", clock);
  await scheduler.instances.ensureDue();
  const today = await scheduler.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (candidate) => candidate.definitionId === definitionId
  );
  if (!instance) {
    throw new Error(`expected an instance on ${day}`);
  }
  return { instance, clock };
};

/** One cow recorded, and the id of the Completion it made. */
const recordCow = async (
  client: Awaited<ReturnType<typeof as>>,
  instanceId: string,
  tagNumber: string,
  litres: number
) => {
  await client.instances.completeStep({
    instanceId,
    stepId: "milk",
    animalTag: tagNumber,
    evidence: [litres],
  });
  const loaded = await client.instances.get({ id: instanceId });
  const completion = loaded.completions.find(
    (row) => row.stepId === "milk" && row.animalId !== null
  );
  if (!completion) {
    throw new Error("expected a completion");
  }
  return completion.id;
};

const tagOf = (index: number) => world.cows[index]?.tagNumber ?? "";

describe("two people recording together", () => {
  it("both start work nobody had started, and neither Step is lost", async () => {
    const { instance, clock } = await session("2026-12-17");
    const staff = await as("staff", clock);
    const manager = await as("manager", clock);
    const both = await Promise.allSettled([
      staff.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: tagOf(0),
        evidence: [10],
      }),
      manager.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: tagOf(1),
        evidence: [9],
      }),
    ]);
    expect(both.map((one) => one.status)).toEqual(["fulfilled", "fulfilled"]);
    const loaded = await manager.instances.get({ id: instance.id });
    expect(loaded.state).toBe("in_progress");
    expect(
      loaded.completions.filter((row) => row.stepId === "milk")
    ).toHaveLength(2);
  });
});

describe("correction windows", () => {
  it("lets Staff put their own entry right for two hours, and not after", async () => {
    const { instance, clock } = await session("2026-12-01");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(HOUR);
    const corrected = await correctStepAsShown(staff, {
      completionId,
      evidence: [12],
      reason: "ভুল লিখেছিলাম",
    });
    expect(corrected.roleUsed).toBe("staff");

    clock.advance(2 * HOUR);
    await expect(
      correctStepAsShown(staff, {
        completionId,
        evidence: [13],
        reason: "আবার ভুল",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      // The refusal is facts, not a sentence: the person reading it reads Bangla, and the
      // phone composes the message from these.
      data: { refusal: { role: "staff", hours: 2, ownEntriesOnly: true } },
    });
  });

  it("refuses Staff another person's entry even inside the window", async () => {
    const { instance, clock } = await session("2026-12-02");
    const manager = await as("manager", clock);
    await manager.instances.claim({ id: instance.id });
    const completionId = await recordCow(manager, instance.id, tagOf(0), 10);

    const staff = await as("staff", clock);
    await expect(
      correctStepAsShown(staff, {
        completionId,
        evidence: [11],
        reason: "মনে হয় ভুল",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets the Manager put anyone's right for thirty days, and not after", async () => {
    const { instance, clock } = await session("2026-12-03");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(29 * DAY);
    // Signed in after the clock moved: a month-old session would have expired, which is a
    // different refusal from the one this test is about.
    const manager = await as("manager", clock);
    const corrected = await correctStepAsShown(manager, {
      completionId,
      evidence: [14],
      reason: "খাতার সাথে মিলিয়ে",
    });
    expect(corrected.roleUsed).toBe("manager");

    clock.advance(2 * DAY);
    const later = await as("manager", clock);
    await expect(
      correctStepAsShown(later, {
        completionId,
        evidence: [15],
        reason: "আরেকবার",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: { role: "manager", days: 30, ownEntriesOnly: false } },
    });
  });

  it("lets the Owner put anything right whenever", async () => {
    const { instance, clock } = await session("2026-12-04");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(400 * DAY);
    const owner = await as("owner", clock);
    const corrected = await correctStepAsShown(owner, {
      completionId,
      evidence: [9],
      reason: "নিরীক্ষার সময় ধরা পড়ল",
    });

    expect(corrected.roleUsed).toBe("owner");
  });

  it("gives a Vet no standing over the milking book, however recent", async () => {
    const { instance, clock } = await session(
      "2026-12-05",
      world.vetSop.definitionId
    );
    const vet = await as("vet", clock);
    await vet.instances.claim({ id: instance.id });
    await vet.instances.completeStep({
      instanceId: instance.id,
      stepId: "check",
      evidence: ["সব ঠিক"],
    });
    const loaded = await vet.instances.get({ id: instance.id });
    const completionId = loaded.completions[0]?.id ?? "";

    // A Vet's unlimited window is over the clinical record — a Diagnosis, a Prescription,
    // a dose they gave. Health arrives in increment 3; until then there is no such entry,
    // and being a Vet is not a licence over the milking book.
    clock.advance(HOUR);
    const vetLater = await as("vet", clock);

    await expect(
      correctStepAsShown(vetLater, {
        completionId,
        evidence: ["বাঁ পায়ে খোঁড়া"],
        reason: "নোট অসম্পূর্ণ ছিল",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: { role: null } },
    });
  });

  it("takes the windows from the Farm Parameters", async () => {
    const setter = await createTestClient(appRouter, { as: "owner" });
    await setter.client.farm.setParameters({ staffCorrectionHours: 8 });
    try {
      const { instance, clock } = await session("2026-12-06");
      const staff = await as("staff", clock);
      await staff.instances.claim({ id: instance.id });
      const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

      // Six hours would have been too late a moment ago.
      clock.advance(6 * HOUR);
      const corrected = await correctStepAsShown(staff, {
        completionId,
        evidence: [11],
        reason: "শিফট শেষে মিলিয়ে",
      });
      expect(corrected.roleUsed).toBe("staff");
    } finally {
      await setter.client.farm.setParameters({ staffCorrectionHours: 2 });
    }
  });
});

describe("what a correction does", () => {
  it("replaces the Milk Record and works the reconciliation out again", async () => {
    const { instance, clock } = await session("2026-12-07");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);
    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [10],
    });
    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [21.5],
    });
    const flagged = await staff.milk.session({ instanceId: instance.id });
    expect(flagged.flaggedAt).not.toBeNull();

    // The 10 was a mis-keyed 11.5. The tank was right all along.
    clock.advance(HOUR);
    const corrected = await correctStepAsShown(staff, {
      completionId,
      evidence: [11.5],
      reason: "কীপ্যাডে ভুল",
    });

    expect(corrected.effect).toMatchObject({ kind: "milk_record" });
    const after = await staff.milk.session({ instanceId: instance.id });
    expect(after.records).toHaveLength(2);
    expect(after).toMatchObject({
      sumBulkLitres: "21.50",
      differenceLitres: "0.00",
      flaggedAt: null,
    });
  });

  it("keeps the entry as it was, beside the correction and its reason", async () => {
    const { instance, clock } = await session("2026-12-08");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(HOUR);
    await correctStepAsShown(staff, {
      completionId,
      evidence: [12],
      reason: "ভুল লিখেছিলাম",
    });

    const manager = await as("manager", clock);
    const history = await manager.audit.list({
      entity: "step_completion",
      entityId: completionId,
    });
    const correction = history.find((row) => row.action === "correct");
    const original = history.find((row) => row.action === "create");
    expect(correction).toMatchObject({
      reason: "ভুল লিখেছিলাম",
      roleUsed: "staff",
    });
    // The Correction points at what it replaced, and carries both figures.
    expect(correction?.supersedesId).toBe(original?.id);
    expect((correction?.before as { evidence?: unknown[] })?.evidence).toEqual([
      10,
    ]);
    expect((correction?.after as { evidence?: unknown[] })?.evidence).toEqual([
      12,
    ]);
  });

  it("reads the trail newest first, even within the one second", async () => {
    const { instance, clock } = await session("2026-12-18");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);
    // No clock.advance: the Correction lands in the same instant as the entry, which is what a farm
    // phone sending a fix straight after the entry actually does. Ordering by the instant alone would
    // leave the two rows in whatever order they happen to lie in.
    await correctStepAsShown(staff, {
      completionId,
      evidence: [11],
      reason: "একই সেকেন্ডে ঠিক করা",
    });

    const manager = await as("manager", clock);
    const history = await manager.audit.list({
      entity: "step_completion",
      entityId: completionId,
    });
    expect(history.map((row) => row.action)).toEqual(["correct", "create"]);
  });

  it("turning an entry into a skip takes its litres away", async () => {
    const { instance, clock } = await session("2026-12-09");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(HOUR);
    await correctStepAsShown(staff, {
      completionId,
      evidence: [],
      skipReason: "অসুস্থ",
      reason: "ওকে দোহন করা হয়নি",
    });

    const session_ = await staff.milk.session({ instanceId: instance.id });
    expect(session_.records).toHaveLength(0);
  });

  it("refuses an answer the Step no longer holds, and one that changes nothing", async () => {
    const { instance, clock } = await session("2026-12-15");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);
    const recorded = {
      skipReason: null,
      evidence: [10],
      destination: null,
      outOfRange: null,
    };

    clock.advance(HOUR);
    // The Manager put it right from the office while the milker's screen still showed ten.
    const manager = await as("manager", clock);
    await correctStepAsShown(manager, {
      completionId,
      evidence: [11],
      reason: "খাতায় এগারো",
    });
    await expect(
      staff.instances.correctStep({
        id: completionId,
        reason: "ভুল লিখেছিলাম",
        changes: { answer: { from: recorded, to: { evidence: [12] } } },
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        refusal: "changed_since",
        now: { answer: expect.objectContaining({ evidence: [11] }) },
      },
    });
    await expect(
      correctStepAsShown(staff, {
        completionId,
        evidence: [11],
        reason: "একই",
      })
    ).rejects.toMatchObject({ data: { refusal: "nothing_to_correct" } });
  });
});

describe("review findings", () => {
  it("keeps the first figure in the trail when a second, different one is sent", async () => {
    const { instance, clock } = await session("2026-12-13");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    // Sending a different figure through the recording path would once have overwritten the
    // first with no reason, no window, and nothing left to say it had ever been ten.
    await expect(
      staff.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: tagOf(0),
        evidence: [3],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    clock.advance(HOUR);
    await correctStepAsShown(staff, {
      completionId,
      evidence: [3],
      reason: "খাতার সাথে মিলিয়ে",
    });

    const manager = await as("manager", clock);
    const history = await manager.audit.list({
      entity: "step_completion",
      entityId: completionId,
    });
    const correction = history.find((row) => row.action === "correct");
    expect((correction?.before as { evidence?: unknown[] })?.evidence).toEqual([
      10,
    ]);
  });

  it("records the Role whose window allowed it, not the highest one held", async () => {
    const { instance, clock } = await session("2026-12-14");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(3 * HOUR);
    const owner = await as("owner", clock);
    await correctStepAsShown(owner, {
      completionId,
      evidence: [12],
      reason: "নিরীক্ষা",
    });

    const history = await owner.audit.list({
      entity: "step_completion",
      entityId: completionId,
    });
    expect(history.find((row) => row.action === "correct")).toMatchObject({
      roleUsed: "owner",
    });
  });
});

describe("needs review", () => {
  it("flags a correction to work already signed off, and tells the Manager", async () => {
    const { instance, clock } = await session("2026-12-10");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);
    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [10],
    });
    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [20],
    });
    await staff.instances.complete({ id: instance.id });
    const manager = await as("manager", clock);
    await manager.instances.approve({ id: instance.id });

    // The Manager signed off on 10 litres. The Owner now says it was 14.
    clock.advance(2 * DAY);
    const owner = await as("owner", clock);
    const corrected = await correctStepAsShown(owner, {
      completionId,
      evidence: [14],
      reason: "খাতার সাথে মিলিয়ে",
    });

    expect(corrected.needsReview).toBe(true);
    const queue = await manager.review.open();
    const entry = queue.find((row) => row.entityId === completionId);
    expect(entry).toMatchObject({
      entity: "step_completion",
      reason: "corrected_after_sign_off",
      resolvedAt: null,
    });
    // The Correction that raised it is reachable from the queue.
    expect(entry?.raisedBy).toMatchObject({ action: "correct" });
    const told = await manager.alerts.mine({ entityId: completionId });
    expect(told.some((row) => row.kind === "needs_review")).toBe(true);

    // Closing it is a judgement, and is recorded as one.
    if (!entry) {
      throw new Error("expected a queue entry");
    }
    await manager.review.resolve({
      id: entry.id,
      resolution: "খাতা ঠিক, অনুমোদন বহাল",
    });
    const remaining = await manager.review.open();
    expect(remaining.some((row) => row.id === entry.id)).toBe(false);
    await expect(
      manager.review.resolve({ id: entry.id, resolution: "আবার" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not flag a correction to work nobody has signed off yet", async () => {
    const { instance, clock } = await session("2026-12-11");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    const completionId = await recordCow(staff, instance.id, tagOf(0), 10);

    clock.advance(HOUR);
    const corrected = await correctStepAsShown(staff, {
      completionId,
      evidence: [11],
      reason: "ভুল",
    });

    expect(corrected.needsReview).toBe(false);
    const manager = await as("manager", clock);
    const queue = await manager.review.open();
    expect(queue.some((row) => row.entityId === completionId)).toBe(false);
  });

  it("is the Manager's queue, not everyone's", async () => {
    const clock = new FakeClock("2026-12-12T05:30:00.000Z");
    const staff = await as("staff", clock);

    await expect(staff.review.open()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
