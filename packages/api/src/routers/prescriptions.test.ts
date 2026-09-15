import { eq } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * The farm's Treatment SOP: the work a Prescription raises, one Instance per dose. It says
 * a Prescription raises it rather than the clock, so nothing raises it on its own.
 */
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
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }, { bn: "ওষুধ শেষ" }],
      effect: { kind: "treatment" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  const shed = await owner.client.herd.createShed({
    name: `prescriptions-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "চিকিৎসা পেন",
  });
  const sop = await owner.client.sops.create({ content: treatmentSop() });
  const product = await vet.client.drugs.add({
    name: { bn: `অক্সিটেট্রাসাইক্লিন ${Date.now()}`, en: "Oxytetracycline" },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });
  // The Staff member who walks this Pen is assigned to it, as they would be.
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-prescriptions-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();

  /** Bought by the Manager, not yet read off the label: nothing may be prescribed from it. */
  const manager = await createTestClient(appRouter, { as: "manager" });
  const unknown = await manager.client.drugs.add({
    name: { bn: `অজানা ${Date.now()}` },
  });
  return { shedId: shed.id, pen, sop, product, unknown };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** Hands the farm back as it was found: the farm treats with one procedure at a time, and the
 *  next file to run publishes its own. */
afterAll(async () => {
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
});

/** A cow with something wrong with her, and the Vet's conclusion about it. */
const aSickCow = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
  const diagnosis = await vet.client.diagnoses.record({
    animalTag: cow.tagNumber,
    disease: { bn: "ওলান প্রদাহ", en: "Mastitis" },
  });
  return { cow, diagnosis, vet, owner };
};

describe("a Prescription, and a dose per Instance", () => {
  it("turns the Vet's order into one piece of work per dose", async () => {
    // Eight in the morning, and the first dose is due at eight.
    const clock = new FakeClock("2028-06-01T02:00:00.000Z");
    const { cow, diagnosis, vet, owner } = await aSickCow(clock);

    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00", "20:00"],
      days: 3,
    });

    // Twice a day for three days is six doses, each its own piece of work.
    expect(course.doses).toBe(6);

    const doses = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    const mine = doses.find((one) => one.id === course.id);
    expect(mine?.doses).toHaveLength(6);
    expect(mine?.doses.at(0)?.state).toBe("due");

    // And the first of them is on today's list, for whoever is in the shed.
    const today = await owner.client.instances.today({ penId: world.pen.id });
    const treatment = today.filter(
      (row) => row.definitionId === world.sop.definitionId
    );
    expect(treatment).toHaveLength(2);
  });

  it("records the dose against the course when Staff give it", async () => {
    const clock = new FakeClock("2028-06-02T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 3,
    });

    // The dose is on the shed's list like anything else, and Staff pick it up.
    const today = await staff.client.instances.today({ penId: world.pen.id });
    const dose = today.find(
      (row) =>
        row.definitionId === world.sop.definitionId && row.animalId === cow.id
    );
    if (!dose) {
      throw new Error("expected the first dose on today's list");
    }
    await staff.client.instances.claim({ id: dose.id });
    const recorded = await staff.client.instances.completeStep({
      instanceId: dose.id,
      stepId: "dose",
      evidence: [true],
    });

    // The phone is told where the course got to, so the person can see it is dose one of
    // three and not the whole course.
    expect(recorded.effect).toMatchObject({
      kind: "treatment",
      number: 1,
      of: 3,
      given: true,
    });

    const courses = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    const doses = courses.find((one) => one.id === course.id)?.doses ?? [];
    expect(doses.at(0)).toMatchObject({
      number: 1,
      givenByName: "রহিম",
    });
    expect(doses.at(0)?.givenAt).not.toBeNull();
    // And the doses nobody has given yet are still owed.
    expect(doses.slice(1).every((one) => one.givenAt === null)).toBe(true);
  });
  it("leaves a dose nobody gave on the day's work, late", async () => {
    // Seven in the morning; the dose is due at eight, with two hours' grace.
    const clock = new FakeClock("2028-06-03T01:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 2,
    });

    const onTime = await staff.client.instances.today({ penId: world.pen.id });
    const first = onTime.find((row) => row.animalId === cow.id);
    expect(first?.overdue).toBe(false);

    // Half past ten: due at eight, two hours' grace, and nobody gave it.
    clock.set("2028-06-03T04:30:00.000Z");
    const later = await createTestClient(appRouter, { as: "staff", clock });
    const missed = await later.client.instances.today({ penId: world.pen.id });
    const late = missed.find((row) => row.animalId === cow.id);
    // Late on the same list as everything else late, worked out from the clock rather than
    // waiting for anything to have run.
    expect(late?.overdue).toBe(true);
  });

  it("raises the course once, however often the day's work is gathered", async () => {
    const clock = new FakeClock("2028-06-04T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00", "20:00"],
      days: 2,
    });

    const doseWork = async () => {
      const today = await staff.client.instances.today({ penId: world.pen.id });
      return today.filter((row) => row.animalId === cow.id);
    };
    const before = await doseWork();
    expect(before).toHaveLength(2);

    // Whatever opens the app gathers the day's work. A Prescription's doses are not the
    // clock's to raise, so gathering finds nothing to add.
    await staff.client.instances.ensureDue();
    await staff.client.instances.ensureDue();

    expect(await doseWork()).toHaveLength(2);
    const courses = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    expect(courses.find((one) => one.id === course.id)?.doses).toHaveLength(4);
  });

  it("refuses everybody but the Vet, and a product nobody has read the label for", async () => {
    const clock = new FakeClock("2028-06-05T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const order = {
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular" as const,
      times: ["08:00"],
      days: 3,
    };

    for (const role of ["owner", "manager", "staff"] as const) {
      const them = await createTestClient(appRouter, { as: role, clock });
      await expect(them.client.prescriptions.prescribe(order)).rejects.toThrow(
        /Only the Vet writes a Prescription/u
      );
    }

    // Nor from the shed phone: a prescription signed on a phone the farm shares is signed
    // by nobody.
    const shedPhone = await createTestClient(appRouter, {
      as: "vet",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-prescriptions", name: "চিকিৎসা শেড ফোন" },
    });
    await expect(
      shedPhone.client.prescriptions.prescribe(order)
    ).rejects.toThrow(/your own phone/u);

    // A product whose withdrawal days nobody has written: the milk could not be called safe
    // afterwards, so the course cannot start.
    await expect(
      vet.client.prescriptions.prescribe({
        ...order,
        productId: world.unknown.id,
      })
    ).rejects.toThrow(/may not be prescribed/u);

    // And a Diagnosis about another animal is not a reason to treat this one.
    const another = await aSickCow(clock);
    await expect(
      vet.client.prescriptions.prescribe({
        ...order,
        diagnosisId: another.diagnosis.id,
      })
    ).rejects.toThrow(/not this animal/u);

    // Nothing was written by any of that.
    expect(
      await vet.client.prescriptions.forAnimal({ tagNumber: cow.tagNumber })
    ).toEqual([]);
  });
  it("takes a dose the shed phone was holding, once, however often it sends it", async () => {
    const clock = new FakeClock("2028-06-06T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 2,
    });

    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-doses", name: "ডোজ শেড ফোন" },
    });
    const today = await phone.client.instances.today({ penId: world.pen.id });
    const dose = today.find((row) => row.animalId === cow.id);
    if (!dose) {
      throw new Error("expected the first dose on today's list");
    }

    // A dose given in the shed with no signal is an entry in the Outbox like any other, and
    // the phone sends it again when it cannot tell whether the first one arrived.
    const batch = {
      key: `dose-replay-${cow.tagNumber}`,
      entries: [
        {
          id: `dose-${cow.tagNumber}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "step_completion" as const,
          instanceId: dose.id,
          stepId: "dose",
          evidence: [true],
        },
      ],
    };
    const sent = await phone.client.sync.batch(batch);
    expect(await phone.client.sync.batch(batch)).toEqual(sent);

    const courses = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    const doses = courses.find((one) => one.id === course.id)?.doses ?? [];
    // One dose given, not two: the same dose sent twice is the same dose.
    expect(doses.filter((one) => one.givenAt !== null)).toHaveLength(1);
  });
  it("reads on her page as one chain, from what the Vet concluded to the doses given", async () => {
    const clock = new FakeClock("2028-06-07T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 2,
    });

    const page = await vet.client.animals.byTag({ tagNumber: cow.tagNumber });
    const conclusion = page.diagnoses.find((one) => one.id === diagnosis.id);
    expect(conclusion?.prescriptions).toHaveLength(1);
    expect(conclusion?.prescriptions.at(0)).toMatchObject({
      dose: "১০ মিলি",
      route: "intramuscular",
      productNameEn: "Oxytetracycline",
      prescribedByName: "ডা. করিম",
    });
    expect(conclusion?.prescriptions.at(0)?.doses).toHaveLength(2);
  });
  it("owes the dose again when a Correction says it was not given after all", async () => {
    const clock = new FakeClock("2028-06-08T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 2,
    });

    const today = await manager.client.instances.today({ penId: world.pen.id });
    const dose = today.find((row) => row.animalId === cow.id);
    if (!dose) {
      throw new Error("expected the first dose on today's list");
    }
    await manager.client.instances.claim({ id: dose.id });
    await manager.client.instances.completeStep({
      instanceId: dose.id,
      stepId: "dose",
      evidence: [true],
    });

    const board = await manager.client.instances.get({ id: dose.id });
    const completionId = board.completions.find(
      (row) => row.stepId === "dose"
    )?.id;
    if (!completionId) {
      throw new Error("expected the dose to have been recorded");
    }

    // It turns out the bottle was empty and nobody gave it. The withdrawal cannot be
    // counted from a dose that was not given, so the course owes it again.
    await correctStepAsShown(manager.client, {
      completionId,
      evidence: [],
      skipReason: "ওষুধ শেষ",
      reason: "বোতল খালি ছিল, দেওয়া হয়নি",
    });

    const courses = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    const doses = courses.find((one) => one.id === course.id)?.doses ?? [];
    expect(doses.at(0)?.givenAt).toBeNull();
    expect(doses.at(0)?.givenByName).toBeNull();
  });
  it("prescribes past a Playbook entry nobody has published yet", async () => {
    const clock = new FakeClock("2028-06-09T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    // A Definition with no published Version — the schema allows one, so the farm may hold
    // one. It says nothing about what raises it, and looking for the treatment procedure
    // must not trip over it. Written directly, because publishing is the only way in
    // through the API and that is the point.
    await scratchDb()
      .insert(sopDefinition)
      .values({
        id: `draft-${Date.now()}`,
        farmId: TEST_FARM.id,
        createdBy: owner.context.actor?.id ?? null,
        createdAt: clock.now(),
      })
      .onConflictDoNothing();

    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 1,
    });
    expect(course.doses).toBe(1);
  });
  it("starts the course today when the day's times have already gone by", async () => {
    // Ten in the morning, farm time, and the course says eight o'clock.
    const clock = new FakeClock("2028-06-10T04:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    const course = await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00"],
      days: 3,
    });
    expect(course.doses).toBe(3);

    // The cow gets one today: a Vet who orders an antibiotic at ten does not mean she waits
    // until tomorrow morning for the first of it.
    const today = await staff.client.instances.today({ penId: world.pen.id });
    expect(today.filter((row) => row.animalId === cow.id)).toHaveLength(1);

    const courses = await vet.client.prescriptions.forAnimal({
      tagNumber: cow.tagNumber,
    });
    const doses = courses.find((one) => one.id === course.id)?.doses ?? [];
    // The first is due now, and the rest keep to the time the Vet set.
    expect(doses.at(0)?.dueAt).toEqual(clock.now());
    expect(doses.map((one) => one.dueAt.toISOString())).toEqual([
      "2028-06-10T04:00:00.000Z",
      "2028-06-11T02:00:00.000Z",
      "2028-06-12T02:00:00.000Z",
    ]);
  });

  it("keeps the doses with the cow when she is moved", async () => {
    const clock = new FakeClock("2028-06-11T02:00:00.000Z");
    const { cow, diagnosis, vet } = await aSickCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const sickBay = await manager.client.herd.createPen({
      shedId: world.shedId,
      name: `আইসোলেশন ${Date.now()}`,
    });

    await vet.client.prescriptions.prescribe({
      animalTag: cow.tagNumber,
      diagnosisId: diagnosis.id,
      productId: world.product.id,
      dose: "১০ মিলি",
      route: "intramuscular",
      times: ["08:00", "20:00"],
      days: 3,
    });

    // A sick cow is walked to isolation. Her doses are hers, so they go with her — otherwise
    // they would stay on a board the staff looking after her never open.
    await manager.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: sickBay.id,
      reason: "চিকিৎসার জন্য আলাদা করা হয়েছে",
    });

    const there = await manager.client.instances.today({ penId: sickBay.id });
    expect(
      there.filter((row) => row.animalId === cow.id).length
    ).toBeGreaterThan(0);
    const behind = await manager.client.instances.today({
      penId: world.pen.id,
    });
    expect(behind.filter((row) => row.animalId === cow.id)).toHaveLength(0);
  });

  it("will not publish a treatment procedure and a prescription trigger apart", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const content = treatmentSop();

    // A procedure a Prescription raises whose steps record no dose would raise work for six
    // doses and record none of them given.
    await expect(
      owner.client.sops.create({
        content: {
          ...content,
          steps: content.steps.map((step) => ({ ...step, effect: undefined })),
        },
      })
    ).rejects.toThrow(/no step here records giving one/u);

    // And a dose step in a procedure nothing prescribes is a step that can never find the
    // dose it is recording.
    await expect(
      owner.client.sops.create({
        content: {
          ...content,
          triggers: [{ kind: "schedule", times: ["08:00"] }],
        },
      })
    ).rejects.toThrow(/nothing but a prescription raises one/u);
  });
});
