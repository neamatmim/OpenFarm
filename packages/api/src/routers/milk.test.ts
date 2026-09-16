import { eq } from "@OpenFarm/db/operators";
import { animal, penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

/** The milking SOP as the farm actually runs it: a per-cow block whose effect writes a Milk
 *  Record, and a closing tank reading whose effect reconciles the Session. */
const milkingSop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ সংগ্রহ" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
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
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "milk_record" },
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
      effect: { kind: "bulk_total" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: `milk-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `দোহন ${suffix}`,
  });
  const sickPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `চিকিৎসা ${suffix}`,
  });

  /** A cow walked up the lifecycle to Milking; the steps must run in order. */
  const milkingCow = async (penId: string, calvedAt?: Date) => {
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
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
      calvedAt,
    });
    return cow;
  };
  const cows = [await milkingCow(pen.id), await milkingCow(pen.id)];
  const sickCow = await milkingCow(sickPen.id);

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values(
      [pen.id, sickPen.id].map((penId) => ({
        id: `pa-milk-${penId}`,
        farmId: theFarm().id,
        userId: thePerson("staff").id,
        penId,
      }))
    )
    .onConflictDoNothing();

  const sop = await owner.client.sops.create({ content: milkingSop() });
  return { owner, pen, sickPen, cows, sickCow, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** A fresh Instance of the milking SOP for a Pen, on its own day, claimed by the Staff
 *  member who works it. Each test takes its own day so the Completions never collide. */
const session = async (day: string, penId = world.pen.id) => {
  const clock = new FakeClock(`${day}T05:30:00.000Z`);
  const scheduler = await createTestClient(appRouter, { as: "owner", clock });
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId });
  const instance = today.find(
    (candidate) => candidate.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected a milking instance");
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: instance.id });
  return { instance, staff, clock, manager: scheduler };
};

const tagOf = (index: number) => world.cows[index]?.tagNumber ?? "";

describe("the milking effect", () => {
  it("writes one Milk Record per cow, and correcting her replaces it", async () => {
    const { instance, staff } = await session("2026-10-01");

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [12.5],
    });
    // The same entry arriving twice — a phone replaying its outbox — is one fact.
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [12.5],
    });
    // A different figure is a changed fact, so it goes through a Correction.
    const board = await staff.client.instances.get({ id: instance.id });
    const entry = board.completions.find((row) => row.stepId === "milk");
    await correctStepAsShown(staff.client, {
      completionId: entry?.id ?? "",
      evidence: [13],
      reason: "কীপ্যাডে ভুল",
    });

    const loaded = await staff.client.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0]).toMatchObject({
      litres: "13.00",
      destination: "bulk",
      forced: false,
      recordedBy: thePerson("staff").id,
    });
    expect(loaded.records[0]?.animal.tagNumber).toBe(tagOf(0));
  });

  it("defaults to Bulk and takes Calves or Discard when the person picks one", async () => {
    const { instance, staff } = await session("2026-10-02");

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [10],
    });
    const picked = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [6],
      destination: "calves",
    });

    expect(picked.effect).toEqual({
      kind: "milk_record",
      destination: "calves",
      forced: false,
    });
    const loaded = await staff.client.milk.session({ instanceId: instance.id });
    expect(
      loaded.records.map((record) => record.destination).toSorted()
    ).toEqual(["bulk", "calves"]);
  });

  it("forces a cow under Withdrawal to Discard however the phone asked", async () => {
    const { instance, staff, clock } = await session(
      "2026-10-03",
      world.sickPen.id
    );
    // Health (increment 3) writes this from a Treatment; seeded here, as the gate's only
    // input either way.
    await scratchDb()
      .update(animal)
      .set({ milkWithdrawalUntil: new Date(clock.now().getTime() + 2 * DAY) })
      .where(eq(animal.tagNumber, world.sickCow.tagNumber));

    const recorded = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: world.sickCow.tagNumber,
      evidence: [9],
      // A phone that last synced before the treatment would still ask for Bulk.
      destination: "bulk",
    });

    expect(recorded.effect).toEqual({
      kind: "milk_record",
      destination: "discard",
      forced: true,
    });
    const loaded = await staff.client.milk.session({ instanceId: instance.id });
    expect(loaded.records[0]).toMatchObject({
      destination: "discard",
      forced: true,
    });
    // And the pen board renders her locked, so nobody is asked to make the choice at all.
    const board = await staff.client.instances.get({ id: instance.id });
    expect(
      board.animals.find((beast) => beast.tagNumber === world.sickCow.tagNumber)
        ?.underMilkWithdrawal
    ).toBe(true);

    await scratchDb()
      .update(animal)
      .set({ milkWithdrawalUntil: null })
      .where(eq(animal.tagNumber, world.sickCow.tagNumber));
  });

  it("a skipped cow has no litres to her name, and skipping her later takes them away", async () => {
    const { instance, staff } = await session("2026-10-04");

    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [11],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      skipReason: "অসুস্থ",
    });
    const afterSkip = await staff.client.milk.session({
      instanceId: instance.id,
    });
    expect(afterSkip.records).toHaveLength(1);

    // The first cow turns out to have been the sick one: her entry becomes a skip, which
    // changes what was recorded and so goes through a Correction.
    const board = await staff.client.instances.get({ id: instance.id });
    const entry = board.completions.find(
      (row) => row.stepId === "milk" && row.status === "done"
    );
    await correctStepAsShown(staff.client, {
      completionId: entry?.id ?? "",
      evidence: [],
      skipReason: "অসুস্থ",
      reason: "ওকে দোহন করা হয়নি",
    });

    const loaded = await staff.client.milk.session({ instanceId: instance.id });
    expect(loaded.records).toEqual([]);
  });

  it("refuses to book litres to a cow that has left the farm", async () => {
    // Her own cow, so that killing her does not take a cow off the later tests' pen board.
    const doomed = await world.owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.pen.id,
      source: "born",
      aliases: [],
    });
    // Deliberately sequential: the lifecycle refuses a state that skips a step.
    const walkTo = (state: "pregnant_heifer" | "milking") =>
      world.owner.client.animals.setState({
        tagNumber: doomed.tagNumber,
        state,
        reason: "test",
      });
    await walkTo("pregnant_heifer");
    await walkTo("milking");
    // She leaves the herd the way the farm records it leaving: with a cause and a disposal.
    await world.owner.client.animals.recordMortality({
      tagNumber: doomed.tagNumber,
      kind: "died",
      cause: "test",
      disposal: "buried",
    });
    const { instance, staff } = await session("2026-10-13");

    // She keeps her Pen, so the Pen alone would still have let the entry through.
    await expect(
      staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: doomed.tagNumber,
        evidence: [8],
      })
      // A cow that has left is the world moving under the entry, not a wrong tag.
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("reconciling the tank", () => {
  it("stores the difference and leaves it unflagged exactly at the tolerance", async () => {
    const { instance, staff } = await session("2026-10-05");
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [10],
    });

    // 21 litres in the tank against 20 the cows account for: one litre out, exactly 5%.
    const closed = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [21],
    });

    expect(closed.effect).toEqual({
      kind: "bulk_total",
      sumBulkLitres: 20,
      differenceLitres: 1,
      differencePercent: 5,
      flagged: false,
    });
    const loaded = await staff.client.milk.session({ instanceId: instance.id });
    expect(loaded).toMatchObject({
      bulkLitres: "21.00",
      sumBulkLitres: "20.00",
      differenceLitres: "1.00",
      tolerancePercent: 5,
      flaggedAt: null,
    });
  });

  it("flags the Session for the Manager once the difference goes beyond it", async () => {
    const { instance, staff, manager } = await session("2026-10-06");
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [10],
    });

    // 21.5 against 20 is 7.5% — a missed cow, a typo, or milk going somewhere it should not.
    const closed = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [21.5],
    });

    expect(closed.effect).toMatchObject({
      differenceLitres: 1.5,
      differencePercent: 7.5,
      flagged: true,
    });
    const queue = await manager.client.milk.flagged();
    expect(queue.map((row) => row.instanceId)).toContain(instance.id);
  });

  it("milk that went to the calves is not milk the tank should hold", async () => {
    const { instance, staff } = await session("2026-10-07");
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [6],
      destination: "calves",
    });

    const closed = await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [10],
    });

    expect(closed.effect).toMatchObject({
      sumBulkLitres: 10,
      differenceLitres: 0,
      flagged: false,
    });
  });

  it("correcting a cow after the tank was read moves the difference with her", async () => {
    const { instance, staff } = await session("2026-10-08");
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [21.5],
    });

    // The 10 was a mis-keyed 11.5: the tank was right all along.
    const board = await staff.client.instances.get({ id: instance.id });
    const entry = board.completions.find(
      (row) => row.stepId === "milk" && row.animalId === world.cows[1]?.id
    );
    await correctStepAsShown(staff.client, {
      completionId: entry?.id ?? "",
      evidence: [11.5],
      reason: "কীপ্যাডে ভুল",
    });

    const loaded = await staff.client.milk.session({ instanceId: instance.id });
    expect(loaded).toMatchObject({
      sumBulkLitres: "21.50",
      differenceLitres: "0.00",
      flaggedAt: null,
    });
  });

  it("takes the tolerance from the Farm Parameters, not from the code", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.farm.setParameters({ milkTolerancePercent: 10 });
    try {
      // A new client, because a request reads the Farm once when its context is built.
      const { instance, staff } = await session("2026-10-09");
      await staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: tagOf(0),
        evidence: [10],
      });
      await staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "milk",
        animalTag: tagOf(1),
        evidence: [10],
      });

      // 7.5% would have been flagged a moment ago; the Manager has widened the tolerance.
      const closed = await staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "bulk",
        evidence: [21.5],
      });

      expect(closed.effect).toMatchObject({
        differencePercent: 7.5,
        flagged: false,
      });
    } finally {
      await owner.client.farm.setParameters({ milkTolerancePercent: 5 });
    }
  });
});

describe("review findings", () => {
  it("asks the Withdrawal gate at whichever clock still holds it shut", async () => {
    const { instance, clock } = await session("2026-10-14", world.sickPen.id);
    await scratchDb()
      .update(animal)
      .set({ milkWithdrawalUntil: new Date(clock.now().getTime() + 2 * DAY) })
      .where(eq(animal.tagNumber, world.sickCow.tagNumber));

    // A phone whose clock runs a week fast — or one sending a made-up time — would walk
    // this cow's milk into the tank if the gate believed it.
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-milk-clock", name: "দোহনের শেড ফোন" },
    });
    const entryId = `milk-fast-clock-${instance.id}`;
    const sent = await phone.client.sync.batch({
      key: entryId,
      entries: [
        {
          id: entryId,
          seq: 1,
          kind: "step_completion" as const,
          instanceId: instance.id,
          stepId: "milk",
          animalTag: world.sickCow.tagNumber,
          evidence: [9],
          destination: "bulk",
          recordedAt: new Date(clock.now().getTime() + 7 * DAY),
        },
      ],
    });

    expect(sent.results).toMatchObject([{ outcome: "applied" }]);
    const record = await scratchDb().query.milkRecord.findFirst({
      where: { completionId: entryId },
      columns: { destination: true, forced: true },
    });
    expect(record).toEqual({ destination: "discard", forced: true });

    await scratchDb()
      .update(animal)
      .set({ milkWithdrawalUntil: null })
      .where(eq(animal.tagNumber, world.sickCow.tagNumber));
  });

  it("refuses a destination on a step that records no milk", async () => {
    const { instance, staff } = await session("2026-10-15");

    await expect(
      staff.client.instances.completeStep({
        instanceId: instance.id,
        stepId: "bulk",
        evidence: [20],
        destination: "calves",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reads the reconciliation back on the Instance the Manager opens", async () => {
    const { instance, staff, manager } = await session("2026-10-16");
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(1),
      evidence: [10],
    });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "bulk",
      evidence: [25],
    });

    const opened = await manager.client.instances.get({ id: instance.id });
    expect(opened.milkingSession).toMatchObject({
      bulkLitres: "25.00",
      sumBulkLitres: "20.00",
      differenceLitres: "5.00",
    });
    expect(opened.milkingSession?.flaggedAt).not.toBeNull();
  });

  it("does not date an opening-register cow's lactation to the day she was written down", async () => {
    const csv = [
      "sex,side,state,pen,source",
      `female,dairy,milking,${world.pen.name},bought`,
    ].join("\n");

    const result = await world.owner.client.animals.importRegister({ csv });
    const [imported] = result.imported;
    if (!imported) {
      throw new Error(`expected an imported row: ${JSON.stringify(result)}`);
    }

    // She is in her first recorded Lactation, but nobody said when she calved — so how far
    // into it she is stays unknown rather than reading as day zero.
    const curve = await world.owner.client.milk.forAnimal({
      tagNumber: imported.tagNumber,
    });
    expect(curve).toMatchObject({
      lactationNumber: 1,
      lactationStartedAt: null,
      daysInMilk: null,
    });
  });

  it("refuses a calving date in the future at registration too", async () => {
    const clock = new FakeClock("2026-10-17T06:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    await expect(
      owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "pregnant_heifer",
        penId: world.pen.id,
        source: "bought",
        aliases: [],
        calvedAt: new Date(clock.now().getTime() + DAY),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("lactations", () => {
  it("numbers themselves and count their own days, from the calving date", async () => {
    const clock = new FakeClock("2026-10-10T06:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.pen.id,
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
      calvedAt: new Date(clock.now().getTime() - 30 * DAY),
    });

    const first = await owner.client.milk.forAnimal({
      tagNumber: cow.tagNumber,
    });
    expect(first).toMatchObject({ lactationNumber: 1, daysInMilk: 30 });

    // Dried off, then calved again: the second Lactation, counting from scratch.
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "dry",
    });
    const dried = await owner.client.milk.forAnimal({
      tagNumber: cow.tagNumber,
    });
    expect(dried).toMatchObject({ lactationNumber: 1, daysInMilk: null });

    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "milking",
    });
    const second = await owner.client.milk.forAnimal({
      tagNumber: cow.tagNumber,
    });
    expect(second).toMatchObject({ lactationNumber: 2, daysInMilk: 0 });
  });

  it("refuses a calving date in the future", async () => {
    const clock = new FakeClock("2026-10-11T06:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.pen.id,
      source: "born",
      aliases: [],
    });
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "pregnant_heifer",
    });

    await expect(
      owner.client.animals.setState({
        tagNumber: cow.tagNumber,
        state: "milking",
        calvedAt: new Date(clock.now().getTime() + DAY),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // And with no date at all she is still in her first Lactation, counted from today —
    // the number is never something anyone types.
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "milking",
    });
    const derived = await owner.client.milk.forAnimal({
      tagNumber: cow.tagNumber,
    });
    expect(derived).toMatchObject({ lactationNumber: 1, daysInMilk: 0 });
  });

  it("keeps each milking against the Lactation it belonged to", async () => {
    const { instance, staff } = await session("2026-10-12");
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "milk",
      animalTag: tagOf(0),
      evidence: [14],
    });

    const curve = await staff.client.milk.forAnimal({ tagNumber: tagOf(0) });
    // Order-independent: other tests in this file milk her too, on their own days.
    expect(curve.records.map((record) => record.litres)).toContain("14.00");
    expect(
      curve.records.every(
        (record) => record.lactationNumber === curve.lactationNumber
      )
    ).toBe(true);
  });
});
