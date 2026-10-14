import { eq, inArray } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { paperText } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Vet's Bangladesh Veterinary Council registration number: on the Vet's record on this farm, and printed beside
// their name wherever a paper names the Vet who prescribed or diagnosed.

const suffix = `${Date.now()}`;
const BVC = "BVC-0457";
const MAY = { from: "2052-05-01", to: "2052-05-31" };

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const treatmentSop = (): SopContent => ({
  name: { bn: `চিকিৎসা ${suffix}`, en: "Treatment" },
  purpose: { bn: "ভেটের লেখা ডোজ দিন" },
  triggers: [{ kind: "prescription" }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "dose",
      text: { bn: "ডোজ দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "treatment" },
    },
  ],
});

const setup = async () => {
  const start = "2052-04-20T04:00:00.000Z";
  const owner = await as("owner", start);
  const vet = await as("vet", start);
  const manager = await as("manager", start);
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({
      registrationNumber: "DLS/SAV/2052/1",
    });
  }
  const shed = await owner.client.sheds.create({ name: `bvc-${suffix}` });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `বিভিসি ${suffix}`,
  });
  const drug = await vet.client.drugs.create({
    name: { bn: `পেনিসিলিন ${suffix}`, en: "Penicillin" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 10,
  });
  const sop = await owner.client.sops.create({ content: treatmentSop() });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-bvc-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return { pen, drug, sop, cow };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
  const vet = await as("vet", "2052-05-02T01:00:00.000Z");
  const diagnosis = await vet.client.diagnoses.record({
    animalTag: world.cow.tagNumber,
    disease: { bn: "ওলান প্রদাহ", en: "Mastitis" },
  });
  await vet.client.prescriptions.prescribe({
    animalTag: world.cow.tagNumber,
    diagnosisId: diagnosis.id,
    productId: world.drug.id,
    dose: "৫ মিলি",
    route: "intramuscular",
    times: ["08:00"],
    days: 1,
  });
  const staff = await as("staff", "2052-05-02T02:30:00.000Z");
  const today = await staff.client.work.today({ penId: world.pen.id });
  const dose = today.find((row) => row.definitionId === world.sop.definitionId);
  await staff.client.work.claim({ id: dose?.id ?? "" });
  await staff.client.work.completeStep({
    instanceId: dose?.id ?? "",
    stepId: "dose",
    evidence: [true],
  });
});

afterAll(async () => {
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(inArray(sopDefinition.id, [world.sop.definitionId]));
  await scratchDb()
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-bvc-${world.pen.id}`));
});

describe("the Vet's BVC number", () => {
  it("is written on the Vet's own record by the Vet, or put right by whoever runs the farm", async () => {
    const vet = await as("vet", "2052-05-03T04:00:00.000Z");
    await vet.client.people.setBvcNumber({ bvcNumber: "BVC-0000" });
    const owner = await as("owner", "2052-05-03T05:00:00.000Z");
    await owner.client.people.setBvcNumber({
      userId: thePerson("vet").id,
      bvcNumber: BVC,
    });

    const record = await vet.client.people.get({ userId: thePerson("vet").id });
    expect(record.bvcNumber).toBe(BVC);
    const listed = await owner.client.people.list();
    expect(
      listed.people.find((one) => one.id === thePerson("vet").id)?.bvcNumber
    ).toBe(BVC);
  });

  it("is a Vet's alone to have, and Barn Staff write nobody's", async () => {
    const owner = await as("owner", "2052-05-03T06:00:00.000Z");
    await expect(
      owner.client.people.setBvcNumber({
        userId: thePerson("staff").id,
        bvcNumber: "BVC-1",
      })
    ).rejects.toMatchObject({ data: { refusal: "bvc_is_a_vets" } });
    const staff = await as("staff", "2052-05-03T06:00:00.000Z");
    await expect(
      staff.client.people.setBvcNumber({
        userId: thePerson("vet").id,
        bvcNumber: "BVC-2",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is printed beside the prescribing Vet on the treatment register and the animal's papers", async () => {
    const manager = await as("manager", "2052-06-10T04:00:00.000Z");
    const register = await manager.client.inspectorView.print({
      register: "treatment_register",
      ...MAY,
    });
    const vetName = thePerson("vet").name;
    expect(
      register.document ? paperText(register.document, "en") : ""
    ).toContain(`Prescribed by: ${vetName} (BVC no. ${BVC})`);
    expect(
      register.document ? paperText(register.document, "bn") : ""
    ).toContain(`প্রেসক্রিপশন: ${vetName} (বিভিসি নং ${BVC})`);

    const passport = await manager.client.papers.passport({
      tagNumber: world.cow.tagNumber,
    });
    expect(paperText(passport.document, "en")).toContain(
      `Prescribed by ${vetName} (BVC no. ${BVC})`
    );
  });

  it("is printed beside the diagnosing Vet on the disease history", async () => {
    const owner = await as("owner", "2052-06-10T04:00:00.000Z");
    const history = await owner.client.inspectorView.print({
      register: "disease_history",
      ...MAY,
    });
    expect(history.document ? paperText(history.document, "en") : "").toContain(
      `${thePerson("vet").name} (BVC no. ${BVC})`
    );
  });
});
