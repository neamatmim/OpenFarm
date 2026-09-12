import { inArray } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { DAY, FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** The farm's Treatment SOP: one Instance per dose, and the Step records giving it. */
const treatmentSop = (): SopContent => ({
  name: { bn: "চিকিৎসা — ডোজ দিন", en: "Treatment — give the dose" },
  purpose: { bn: "ভেটের লেখা ডোজ পশুকে দিন এবং লিখে রাখুন" },
  triggers: [{ kind: "prescription" }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "dose",
      text: { bn: "ডোজ দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "ওষুধ শেষ" }],
      effect: { kind: "treatment" },
    },
  ],
});

/** The milking round: one cow at a time, litres into the tank. */
const milkingSop = (): SopContent => ({
  name: { bn: "দুধ দোহন", en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ মেপে লিখুন" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "litres",
      text: { bn: "লিটার লিখুন" },
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
      skipReasons: [{ bn: "গাভী পাওয়া যায়নি" }],
      effect: { kind: "milk_record" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  const shed = await owner.client.herd.createShed({
    name: `withdrawals-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "চিকিৎসা পেন",
  });
  const treatment = await owner.client.sops.create({ content: treatmentSop() });
  const milking = await owner.client.sops.create({ content: milkingSop() });
  const product = await vet.client.drugs.add({
    name: { bn: `পেনস্ট্রেপ ${Date.now()}`, en: "Pen-strep" },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-withdrawals-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  return { pen, treatment, milking, product };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/**
 * Hands the farm back as it was found. Every test file shares one Farm and one database, and a
 * milking round left standing raises work in every Pen on it — including the Pens of files
 * that run after this one, whose day would then contain a round they never wrote.
 *
 * Retired directly because retiring an SOP is not something the API does yet.
 */
afterAll(async () => {
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(
      inArray(sopDefinition.id, [
        world.milking.definitionId,
        world.treatment.definitionId,
      ])
    );
});

/** A milking cow on a three-day course, and the work her doses raised. */
const onACourse = async (clock: FakeClock, days = 3) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "pregnant_heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
  // In milk, because the milk gate is the thing with teeth.
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "milking",
  });
  const diagnosis = await vet.client.diagnoses.record({
    animalTag: cow.tagNumber,
    disease: { bn: "ওলান প্রদাহ", en: "Mastitis" },
  });
  const course = await vet.client.prescriptions.prescribe({
    animalTag: cow.tagNumber,
    diagnosisId: diagnosis.id,
    productId: world.product.id,
    dose: "১০ মিলি",
    route: "intramuscular",
    times: ["08:00"],
    days,
  });
  return { cow, diagnosis, course, vet, owner };
};

/**
 * Gives one dose of her course, by its number — the Staff member picks it up from the day's
 * work, or from the Overdue list when it is late, and either way it is the same Instance.
 */
const giveDose = async (
  clock: FakeClock,
  tagNumber: string,
  number: number
) => {
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const [course] = await vet.client.prescriptions.forAnimal({ tagNumber });
  const dose = course?.doses.find((one) => one.number === number);
  if (!dose) {
    throw new Error(`expected dose ${number} of her course`);
  }
  await staff.client.instances.claim({ id: dose.instanceId });
  await staff.client.instances.completeStep({
    instanceId: dose.instanceId,
    stepId: "dose",
    evidence: [true],
  });
  return dose;
};

describe("withdrawal, from the last dose actually given", () => {
  it("holds her milk and her meat from the dose, on the product's own days", async () => {
    const clock = new FakeClock("2026-10-01T02:00:00.000Z");
    const { cow, owner } = await onACourse(clock);
    await giveDose(clock, cow.tagNumber, 1);

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    // Four days for the milk and twenty-one for the meat, counted from the dose that was
    // actually given rather than from the course that was planned.
    expect(her.milkWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 4 * DAY)
    );
    expect(her.meatWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 21 * DAY)
    );
    expect(her.underMilkWithdrawal).toBe(true);
  });
  it("counts from the dose that was really given, not the one that was planned", async () => {
    const clock = new FakeClock("2026-10-02T02:00:00.000Z");
    const { cow, owner } = await onACourse(clock);
    await giveDose(clock, cow.tagNumber, 1);
    const fromTheFirst = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });

    // Nobody gave the second dose on its day; it is given three days late, by which time the
    // hold from the first has already run out.
    clock.advance(3 * DAY);
    const later = await createTestClient(appRouter, { as: "owner", clock });
    await giveDose(clock, cow.tagNumber, 2);

    const her = await later.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.milkWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 4 * DAY)
    );
    // Four days on from the late dose, which is later than four days on from the first.
    expect(
      (her.milkWithdrawalUntil?.getTime() ?? 0) >
        (fromTheFirst.milkWithdrawalUntil?.getTime() ?? 0)
    ).toBe(true);
  });

  it("pours her milk away while she is held, whatever the phone asked for", async () => {
    const clock = new FakeClock("2026-10-03T02:00:00.000Z");
    const { cow } = await onACourse(clock);
    await giveDose(clock, cow.tagNumber, 1);

    // The milking round, on a phone that has been out of signal since before the dose and
    // still believes her milk is saleable.
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.instances.ensureDue();
    const today = await staff.client.instances.today({ penId: world.pen.id });
    const milking = today.find(
      (row) => row.definitionId === world.milking.definitionId
    );
    if (!milking) {
      throw new Error("expected the milking round");
    }
    await staff.client.instances.claim({ id: milking.id });
    const recorded = await staff.client.instances.completeStep({
      instanceId: milking.id,
      stepId: "litres",
      animalTag: cow.tagNumber,
      evidence: [7.5],
      destination: "bulk",
    });

    // The gate is the server's, not the phone's: her litres are recorded and sent to Discard,
    // and the record says the answer was taken out of the milker's hands.
    expect(recorded.effect).toMatchObject({
      kind: "milk_record",
      destination: "discard",
      forced: true,
    });
  });
  it("pours away litres the phone was still holding when the dose was recorded", async () => {
    const clock = new FakeClock("2026-10-12T02:00:00.000Z");
    const { cow } = await onACourse(clock, 1);
    await giveDose(clock, cow.tagNumber, 1);

    // The milking round is on the shed phone's Outbox from before the dose was recorded, and
    // reaches the farm afterwards asking for the tank. The phone's gate is its last sync; the
    // server's is the one that decides.
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-gate", name: "গেট শেড ফোন" },
    });
    await phone.client.instances.ensureDue();
    const today = await phone.client.instances.today({ penId: world.pen.id });
    const milking = today.find(
      (row) => row.definitionId === world.milking.definitionId
    );
    if (!milking) {
      throw new Error("expected the milking round");
    }
    const sent = await phone.client.sync.batch({
      key: `gate-${cow.tagNumber}`,
      entries: [
        {
          id: `gate-entry-${cow.tagNumber}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "step_completion" as const,
          instanceId: milking.id,
          stepId: "litres",
          animalTag: cow.tagNumber,
          evidence: [6],
          destination: "bulk" as const,
        },
      ],
    });
    expect(sent.results.every((one) => one.outcome === "applied")).toBe(true);

    // Recorded, never lost — and not in the tank.
    const session = await phone.client.milk.session({ instanceId: milking.id });
    const hers = session.records.find(
      (row) => row.animal.tagNumber === cow.tagNumber
    );
    expect(hers).toMatchObject({ destination: "discard", forced: true });
  });

  it("lets the Vet shorten it, with a reason, and nobody else at all", async () => {
    const clock = new FakeClock("2026-10-04T02:00:00.000Z");
    const { cow, vet, owner } = await onACourse(clock, 1);
    await giveDose(clock, cow.tagNumber, 1);
    const held = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    const wasUntil = held.milkWithdrawalUntil;

    // The Manager runs the farm and the Owner owns it, and neither may let milk into the tank
    // a day early: that is the prescriber's call and nobody else's.
    for (const role of ["owner", "manager", "staff"] as const) {
      const them = await createTestClient(appRouter, { as: role, clock });
      await expect(
        them.client.withdrawals.shorten({
          animalTag: cow.tagNumber,
          milkUntil: clock.now(),
          reason: "দুধ দরকার",
        })
      ).rejects.toThrow(/Only the Vet/u);
    }

    // The Vet saw her, and says her milk is fine from tomorrow morning.
    const tomorrow = new Date(clock.now().getTime() + DAY);
    await vet.client.withdrawals.shorten({
      animalTag: cow.tagNumber,
      milkUntil: tomorrow,
      reason: "একটি ডোজেই সেরে গেছে, দুধ নিরাপদ",
    });

    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.milkWithdrawalUntil).toEqual(tomorrow);
    expect(after.shortened).toMatchObject({
      reason: "একটি ডোজেই সেরে গেছে, দুধ নিরাপদ",
    });
    // Her meat is untouched: the Vet shortened the milk and said nothing about the rest.
    expect(after.meatWithdrawalUntil).toEqual(held.meatWithdrawalUntil);

    // Nothing is lost: the trail holds what it was before, who changed it and why.
    const trail = await vet.client.audit.list({
      entity: "animal",
      entityId: cow.id,
    });
    const change = trail.find(
      (event) => event.reason === "একটি ডোজেই সেরে গেছে, দুধ নিরাপদ"
    );
    expect(change).toMatchObject({
      action: "update",
      roleUsed: "vet",
      before: { milkWithdrawalUntil: wasUntil?.toISOString() ?? null },
    });
  });

  it("will not let a Withdrawal be made longer under the name of shortening it", async () => {
    const clock = new FakeClock("2026-10-05T02:00:00.000Z");
    const { cow, vet } = await onACourse(clock, 1);
    await giveDose(clock, cow.tagNumber, 1);

    // Holding her longer is not this procedure's business — the product's days are the Drug
    // List's, and an exception that could lengthen a hold could hide one being shortened.
    await expect(
      vet.client.withdrawals.shorten({
        animalTag: cow.tagNumber,
        milkUntil: new Date(clock.now().getTime() + 30 * DAY),
        reason: "আরও অপেক্ষা করি",
      })
    ).rejects.toThrow(/shorten/u);
  });

  it("sets the dates afresh when she is given another dose after an exception", async () => {
    const clock = new FakeClock("2026-10-06T02:00:00.000Z");
    const { cow, vet, owner } = await onACourse(clock, 3);
    await giveDose(clock, cow.tagNumber, 1);
    await vet.client.withdrawals.shorten({
      animalTag: cow.tagNumber,
      milkUntil: clock.now(),
      reason: "ভুল ওষুধ, এক ফোঁটাও যায়নি",
    });

    // Then she is treated again the next day. The exception was about the course that had
    // finished, not a promise about everything to come.
    clock.advance(DAY);
    await giveDose(clock, cow.tagNumber, 2);

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.milkWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 4 * DAY)
    );
    expect(her.shortened).toBeNull();
  });
  it("tells the Owner and the Manager when a Withdrawal is nearly over", async () => {
    const clock = new FakeClock("2026-10-07T02:00:00.000Z");
    const { cow } = await onACourse(clock, 1);
    await giveDose(clock, cow.tagNumber, 1);

    // Three and a half days on: her four days are nearly up, and the Manager plans the tank
    // around it. (The dates in this file sit just after the farm was created, deliberately:
    // every test file shares one farm, and a sweep on a later clock would call every other
    // file's unfinished work late.)
    clock.advance(3 * DAY + DAY / 2);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.alerts.sweep();

    // Asked about this cow's own Withdrawal, not about everything the farm is being told:
    // every test file shares this farm, and a count of its notices is nobody's business here.
    const held = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    const about = {
      entityId: `${cow.id}:${held.milkWithdrawalUntil?.toISOString()}`,
    };
    expect(await manager.client.alerts.mine(about)).toHaveLength(1);

    // Said once, however often anybody opens the app.
    await manager.client.alerts.sweep();
    expect(await manager.client.alerts.mine(about)).toHaveLength(1);
  });
  it("puts the day she is fit for sale in front of the Manager", async () => {
    const clock = new FakeClock("2026-10-08T02:00:00.000Z");
    const { cow } = await onACourse(clock, 1);
    await giveDose(clock, cow.tagNumber, 1);

    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const home = await manager.client.home.manager();
    const hers = home.queue.meatWithdrawal.find((one) => one.id === cow.id);
    // Twenty-one days for the meat: the Sale SOP arrives in increment 4 and reads this same
    // date, and until then the Manager is at least told.
    expect(hers?.fitForSaleAt).toEqual(
      new Date(clock.now().getTime() + 21 * DAY)
    );
  });
  it("ends a hold outright when the Vet says it is over", async () => {
    const clock = new FakeClock("2026-10-09T02:00:00.000Z");
    const { cow, vet, owner } = await onACourse(clock, 1);
    await giveDose(clock, cow.tagNumber, 1);

    // The wrong bottle: nothing that holds milk back ever went in.
    const ended = await vet.client.withdrawals.shorten({
      animalTag: cow.tagNumber,
      milkUntil: null,
      meatUntil: null,
      reason: "ভুল বোতল, কিছুই দেওয়া হয়নি",
    });
    // What is in force now, not what was in force before: a farm told the old date would
    // think nothing had happened.
    expect(ended).toEqual({ milkUntil: null, meatUntil: null });

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.milkWithdrawalUntil).toBeNull();
    expect(her.underMilkWithdrawal).toBe(false);
    // And what her doses said is still on her page, because that is what a slaughter vet asks.
    expect(her.shortened?.wasMilkUntil).toEqual(
      new Date(clock.now().getTime() + 4 * DAY)
    );
  });

  it("holds her again for a dose the farm only hears about later", async () => {
    const clock = new FakeClock("2026-10-10T02:00:00.000Z");
    const { cow, vet, owner } = await onACourse(clock, 2);
    await giveDose(clock, cow.tagNumber, 1);
    await vet.client.withdrawals.shorten({
      animalTag: cow.tagNumber,
      milkUntil: clock.now(),
      reason: "একটি ডোজেই সেরে গেছে",
    });

    // The next morning, a phone that has been out of signal since yesterday sends the second
    // dose. The Vet shortened a hold on what the farm knew then; a dose is new knowledge
    // however long it took to arrive.
    clock.advance(DAY);
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-withdrawals", name: "আটকে রাখার শেড ফোন" },
    });
    const [course] = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    const second = course?.doses.find((one) => one.number === 2);
    if (!second) {
      throw new Error("expected a second dose");
    }
    const batch = {
      key: `held-dose-${cow.tagNumber}`,
      entries: [
        {
          id: `held-dose-entry-${cow.tagNumber}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "step_completion" as const,
          instanceId: second.instanceId,
          stepId: "dose",
          evidence: [true],
        },
      ],
    };
    const sent = await phone.client.sync.batch(batch);

    const her = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.milkWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 4 * DAY)
    );
    expect(her.shortened).toBeNull();

    // And the same entry sent again changes nothing: the doses say what they already said, so
    // nothing is recomputed and nothing the Vet wrote is undone.
    await vet.client.withdrawals.shorten({
      animalTag: cow.tagNumber,
      milkUntil: clock.now(),
      reason: "দেখে মনে হলো ঠিক আছে",
    });
    expect(await phone.client.sync.batch(batch)).toEqual(sent);
    const after = await owner.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(after.milkWithdrawalUntil).toEqual(clock.now());
    expect(after.shortened?.reason).toBe("দেখে মনে হলো ঠিক আছে");
  });

  it("refuses to hold her where nothing is holding her", async () => {
    const clock = new FakeClock("2026-10-11T02:00:00.000Z");
    const { cow, vet } = await onACourse(clock, 1);

    // No dose given, so nothing holds her. Inventing a hold is not shortening one.
    await expect(
      vet.client.withdrawals.shorten({
        animalTag: cow.tagNumber,
        milkUntil: new Date(clock.now().getTime() + DAY),
        reason: "সাবধানতা",
      })
    ).rejects.toThrow(/shortened/u);
  });
});
