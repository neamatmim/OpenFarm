import type { AlertKind } from "@OpenFarm/db/schema/alert";
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
import { appRouter } from "./index";

// A course's doses: given when they are due, said for what they were when they were not, and stopped when the Vet
// gives the course up.

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

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  const shed = await owner.client.sheds.create({
    name: `doses-and-courses-${Date.now()}`,
  });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: "কোর্সের পেন",
  });
  await owner.client.sops.create({ content: treatmentSop() });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-doses-and-courses-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const product = await vet.client.drugs.create({
    name: { bn: `কোর্সের ওষুধ ${Date.now()}`, en: "Course drug" },
    milkWithdrawalDays: 2,
    meatWithdrawalDays: 7,
  });
  return { pen, product };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const onACourse = async (clock: FakeClock, days: number) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const heifer = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
  const diagnosis = await vet.client.diagnoses.record({
    animalTag: heifer.tagNumber,
    disease: { bn: "জ্বর", en: "Fever" },
  });
  const course = await vet.client.prescriptions.prescribe({
    animalTag: heifer.tagNumber,
    diagnosisId: diagnosis.id,
    productId: world.product.id,
    dose: "১০ মিলি",
    route: "intramuscular",
    times: ["08:00"],
    days,
  });
  return { heifer, owner, vet, course };
};

const doseOf = async (clock: FakeClock, tagNumber: string, number: number) => {
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const [course] = await vet.client.prescriptions.forAnimal({ tagNumber });
  const dose = course?.doses.find((one) => one.number === number);
  if (!dose) {
    throw new Error(`expected dose ${number} of her course`);
  }
  return dose;
};

const record = async (
  clock: FakeClock,
  tagNumber: string,
  number: number,
  skippedBecause?: string
) => {
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  const dose = await doseOf(clock, tagNumber, number);
  await staff.client.work.claim({ id: dose.instanceId });
  await staff.client.work.completeStep({
    instanceId: dose.instanceId,
    stepId: "dose",
    ...(skippedBecause
      ? { evidence: [], skipReason: skippedBecause }
      : { evidence: [true] }),
  });
};

const toldTo = async (role: "manager" | "vet", kind: AlertKind) => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind, userId: thePerson(role).id, farmId: theFarm().id },
    columns: { params: true },
  });
  return rows.map((one) => one.params as Record<string, unknown>);
};

describe("a course's dose", () => {
  it("is not taken days before it is due", async () => {
    // Prescribed at nine at night and given at once; the second is the next morning's, the third the morning after.
    const clock = new FakeClock("2033-02-01T15:00:00.000Z");
    const { heifer } = await onACourse(clock, 3);
    await record(clock, heifer.tagNumber, 1);

    // The next morning, a wrong tap on the third dose.
    clock.advance(11 * HOUR);
    await expect(record(clock, heifer.tagNumber, 3)).rejects.toMatchObject({
      data: { refusal: "dose_not_due_yet" },
    });
  });

  it("skipped, is said as skipped and why, not as still owed", async () => {
    const clock = new FakeClock("2033-02-10T15:00:00.000Z");
    const { heifer, vet } = await onACourse(clock, 1);
    clock.advance(DAY);
    await record(clock, heifer.tagNumber, 1, "ওষুধ শেষ");

    const [course] = await vet.client.prescriptions.forAnimal({
      tagNumber: heifer.tagNumber,
    });
    expect(course?.doses[0]).toMatchObject({
      givenAt: null,
      skippedBecause: "ওষুধ শেষ",
    });
  });
});

describe("a course the Vet gives up", () => {
  it("is stopped, and the doses still to give are owed no more", async () => {
    const clock = new FakeClock("2033-02-20T15:00:00.000Z");
    const { heifer, vet, course } = await onACourse(clock, 3);
    clock.advance(DAY);
    await record(clock, heifer.tagNumber, 1);

    await vet.client.prescriptions.stop({
      id: course.id,
      reason: "জ্বর সেরে গেছে",
    });

    const [after] = await vet.client.prescriptions.forAnimal({
      tagNumber: heifer.tagNumber,
    });
    expect(after?.stopped).toMatchObject({ reason: "জ্বর সেরে গেছে" });
    // The dose given stands; the two still to give are owed no more.
    expect(after?.doses[0]?.givenAt).not.toBeNull();
    expect(after?.doses.map((one) => one.state === "called_off")).toEqual([
      false,
      true,
      true,
    ]);
    // Only the Vet stops a course: it is the prescriber's word.
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await expect(
      owner.client.prescriptions.stop({ id: course.id, reason: "আর লাগবে না" })
    ).rejects.toThrow();
  });
});

describe("a dose not prescribed", () => {
  it("from a Lot past its day is told to the Vet and the Manager", async () => {
    const clock = new FakeClock("2033-03-01T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const product = await vet.client.drugs.create({
      name: { bn: `মেয়াদি ওষুধ ${Date.now()}` },
      milkWithdrawalDays: 1,
      meatWithdrawalDays: 1,
    });
    await manager.client.drugs.purchase({
      drugProductId: product.id,
      quantity: "৫ ডোজ",
      doses: 5,
      priceMoney: 500,
      seller: { name: "ফার্মেসি মেয়াদ" },
      purchasedOn: "2033-03-01",
      lotNumber: "SOON-1",
      expiresOn: "2033-03-05",
    });
    const { heifer } = await onACourse(clock, 1);

    clock.advance(10 * DAY);
    const later = await createTestClient(appRouter, { as: "manager", clock });
    await later.client.treatments.giveNotPrescribed({
      animalTag: heifer.tagNumber,
      productId: product.id,
      advice: "জ্বর, ফার্মেসির পরামর্শে",
    });

    const told = await toldTo("vet", "expired_dose_given");
    expect(told.filter((one) => one.lotNumber === "SOON-1")).toHaveLength(1);
  });
});
