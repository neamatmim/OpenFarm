import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The farm's DLS report procedure: raised by a notifiable Diagnosis, done by the Manager, and
 * its Step records the reference the letter was delivered under.
 */
const reportSop = (): SopContent => ({
  name: { bn: "ডিএলএস-কে রোগ জানানো", en: "Notifiable disease report to DLS" },
  purpose: { bn: "উপজেলা প্রাণিসম্পদ অফিসারকে লিখিতভাবে জানান — দেরি না করে" },
  triggers: [{ kind: "notifiable_disease" }],
  assignedRole: "manager",
  checkerRole: "owner",
  graceMinutes: 0,
  steps: [
    {
      id: "deliver",
      text: { bn: "চিঠি পৌঁছে দিন এবং রেফারেন্স লিখুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "note", required: true }],
      skipReasons: [],
      effect: { kind: "dls_report" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `notifiable-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "রোগ পেন",
  });
  const sop = await owner.client.sops.create({ content: reportSop() });
  return { pen, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { eq } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { scratchDb } = await import("@OpenFarm/test-harness");
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
});

const aCow = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  return await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
};

describe("the letter that goes without delay", () => {
  it("raises the report the moment the Vet names a disease on the list", async () => {
    const clock = new FakeClock("2027-01-05T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    // What the ULO confirmed must be reported.
    const anthrax = await manager.client.notifiable.add({
      name: { bn: "তড়কা", en: "Anthrax" },
      note: "ইউএলও নিশ্চিত করেছেন, ২০২৬",
    });
    expect(anthrax.id).toBeTruthy();

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: "তড়কা", en: "Anthrax" },
    });

    // Raised there and then, not when somebody next opens the app: the Act says without delay.
    const work = await manager.client.instances.today({ penId: world.pen.id });
    const report = work.filter(
      (row) => row.definitionId === world.sop.definitionId
    );
    expect(report).toHaveLength(1);
    expect(report.at(0)?.animalId).toBe(cow.id);
    expect(report.at(0)?.dueAt).toEqual(clock.now());
    expect(report.at(0)?.overdue).toBe(true);

    // Once per Diagnosis, however often anything runs.
    await manager.client.instances.ensureDue();
    const again = await manager.client.instances.today({ penId: world.pen.id });
    expect(
      again.filter((row) => row.definitionId === world.sop.definitionId)
    ).toHaveLength(1);
    expect(made.id).toBeTruthy();
  });
  it("leaves a disease nobody has to report alone", async () => {
    const clock = new FakeClock("2027-01-06T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: "ওলান প্রদাহ", en: "Mastitis" },
    });
    expect(made.notifiable).toBe(false);
    expect(made.reportInstanceId).toBeNull();

    // No work, and no letter to write: reporting a mastitis to the office would teach the
    // office to ignore the farm.
    const work = await manager.client.instances.today({ penId: world.pen.id });
    expect(
      work.some(
        (row) =>
          row.definitionId === world.sop.definitionId && row.animalId === cow.id
      )
    ).toBe(false);
    await expect(
      manager.client.notifiable.letter({ diagnosisId: made.id })
    ).rejects.toThrow(/must be reported/u);
  });

  it("writes the letter from what the farm already knows", async () => {
    const clock = new FakeClock("2027-01-07T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await manager.client.notifiable.add({
      name: { bn: `ক্ষুরারোগ ${Date.now()}`, en: "Foot and mouth" },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });
    expect(made.notifiable).toBe(true);

    const { text } = await manager.client.notifiable.letter({
      diagnosisId: made.id,
    });
    // Addressed to the office, naming the animal, the disease, the Vet who found it and the
    // law it is written under — nothing the Manager has to type.
    expect(text).toContain("উপজেলা প্রাণিসম্পদ কর্মকর্তা");
    expect(text).toContain(cow.tagNumber);
    expect(text).toContain(disease);
    expect(text).toContain("ডা. করিম");
    expect(text).toContain("প্রাণিরোগ আইন, ২০০৫");
    expect(text).toContain("ম্যানেজার");

    // Writing it is an Audit Event of its own: a letter that went is the farm's evidence, and
    // when it was written is part of that.
    const trail = await manager.client.audit.list({ entity: "dls_report" });
    expect(
      trail.some(
        (event) =>
          event.action === "export" &&
          (event.after as { diagnosisId?: string } | null)?.diagnosisId ===
            made.id
      )
    ).toBe(true);
  });

  it("records the reference the office gave it, and refuses a report nobody can evidence", async () => {
    const clock = new FakeClock("2027-01-08T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await manager.client.notifiable.add({
      name: { bn: `তড়কা ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";
    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });
    if (!made.reportInstanceId) {
      throw new Error("expected the report to have been raised");
    }

    await manager.client.instances.claim({ id: made.reportInstanceId });
    // Delivered with nothing to show for it is not delivered.
    await expect(
      manager.client.instances.completeStep({
        instanceId: made.reportInstanceId,
        stepId: "deliver",
        evidence: [""],
      })
    ).rejects.toThrow();

    const done = await manager.client.instances.completeStep({
      instanceId: made.reportInstanceId,
      stepId: "deliver",
      evidence: ["ULO/2027/০১১"],
    });
    expect(done.effect).toMatchObject({
      kind: "dls_report",
      reference: "ULO/2027/০১১",
      delivered: true,
    });
  });

  it("will not publish a report procedure that lets the reference be left blank", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const content = reportSop();
    const [step] = content.steps;
    if (!step) {
      throw new Error("expected the delivery step");
    }

    // A Step that lets it be left blank is a Step that lets the farm say it reported something
    // it cannot show it reported.
    await expect(
      owner.client.sops.create({
        content: {
          ...content,
          steps: [{ ...step, evidence: [{ type: "note", required: false }] }],
        },
      })
    ).rejects.toThrow(/required/u);

    // And a delivery Step in a procedure nothing reports is a Step that can never find a
    // report to record.
    await expect(
      owner.client.sops.create({
        content: {
          ...content,
          triggers: [{ kind: "schedule", times: ["08:00"] }],
        },
      })
    ).rejects.toThrow(/nothing but a notifiable diagnosis raises one/u);
  });
  it("tells the Owner and the Manager the moment it is found", async () => {
    const clock = new FakeClock("2027-01-09T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await manager.client.notifiable.add({
      name: { bn: `জলাতঙ্ক ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });

    // Asked about this Diagnosis, not about everything the farm is being told: every test file
    // shares this farm.
    const told = await manager.client.alerts.mine({ entityId: made.id });
    expect(told).toHaveLength(1);
    expect(told.at(0)).toMatchObject({
      kind: "notifiable_diagnosis",
      params: { tag: cow.tagNumber, disease },
    });

    // And the Owner too: the Manager takes the letter, the Owner answers for the farm if it
    // does not go.
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    expect(await owner.client.alerts.mine({ entityId: made.id })).toHaveLength(
      1
    );
  });
  it("starts the duty when a Correction names a disease on the list", async () => {
    const clock = new FakeClock("2027-01-10T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await manager.client.notifiable.add({
      name: { bn: `গলাফুলা ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";

    // Called something else first, so nothing was owed.
    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: "জ্বর, কারণ অজানা" },
    });
    expect(made.notifiable).toBe(false);

    // The Vet looks again and names it. The duty starts now, not when the first entry was made.
    const fixed = await vet.client.diagnoses.correct({
      id: made.id,
      disease: { bn: disease },
      reason: "পরীক্ষার ফল এসেছে",
    });
    expect(fixed.notifiable).toBe(true);
    expect(fixed.reportInstanceId).toBeTruthy();
    expect(
      await manager.client.alerts.mine({ entityId: made.id })
    ).toHaveLength(1);
    const letter = await manager.client.notifiable.letter({
      diagnosisId: made.id,
    });
    expect(letter.text).toContain(disease);
  });

  it("takes the duty back when a Correction says it was something else", async () => {
    const clock = new FakeClock("2027-01-11T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await manager.client.notifiable.add({
      name: { bn: `বাদলা ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";
    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });
    if (!made.reportInstanceId) {
      throw new Error("expected the report to have been raised");
    }

    // It was not that after all. Leaving the Manager under orders to write a letter about a
    // disease the Vet has taken back would be worse than never having raised one.
    await vet.client.diagnoses.correct({
      id: made.id,
      disease: { bn: "সাধারণ জ্বর" },
      reason: "আগের সিদ্ধান্ত ভুল ছিল",
    });

    const work = await manager.client.instances.get({
      id: made.reportInstanceId,
    });
    expect(work.state).toBe("missed");
    await expect(
      manager.client.notifiable.letter({ diagnosisId: made.id })
    ).rejects.toThrow(/must be reported/u);
  });

  it("has a letter to take even when the farm published no procedure", async () => {
    // A farm whose Playbook has no report procedure still owes the office a letter.
    const clock = new FakeClock("2027-01-12T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await manager.client.notifiable.add({
      name: { bn: `পিপিআর ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";

    // The file's own procedure, retired for the length of this test.
    const { eq } = await import("@OpenFarm/db/operators");
    const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
    const { scratchDb } = await import("@OpenFarm/test-harness");
    await scratchDb()
      .update(sopDefinition)
      .set({ retiredAt: clock.now() })
      .where(eq(sopDefinition.id, world.sop.definitionId));

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });
    // No work to do it under, but the duty is the Act's and not the Playbook's.
    expect(made.notifiable).toBe(true);
    expect(made.reportInstanceId).toBeNull();
    expect(await owner.client.alerts.mine({ entityId: made.id })).toHaveLength(
      1
    );
    const letter = await manager.client.notifiable.letter({
      diagnosisId: made.id,
    });
    expect(letter.text).toContain(disease);

    await scratchDb()
      .update(sopDefinition)
      .set({ retiredAt: null })
      .where(eq(sopDefinition.id, world.sop.definitionId));
  });

  it("will not publish a report nobody in the office would accept", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const content = reportSop();

    // A legal notice resting on whoever is nearest the shed is not a legal notice.
    await expect(
      owner.client.sops.create({
        content: { ...content, assignedRole: "staff" },
      })
    ).rejects.toThrow(/Manager's to take/u);

    // And the farm reports with one procedure: two would mean the farm being told silently
    // which of them it reports with.
    await expect(owner.client.sops.create({ content })).rejects.toThrow(
      /already has a procedure a notifiable diagnosis raises/u
    );
  });
  it("gives the mortality register its path to the office's reference", async () => {
    const clock = new FakeClock("2027-01-13T04:00:00.000Z");
    const cow = await aCow(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await manager.client.notifiable.add({
      name: { bn: `তড়কা-রেজিস্টার ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";
    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });
    if (!made.reportInstanceId) {
      throw new Error("expected the report to have been raised");
    }
    await manager.client.instances.claim({ id: made.reportInstanceId });
    await manager.client.instances.completeStep({
      instanceId: made.reportInstanceId,
      stepId: "deliver",
      evidence: ["ULO/2027/৩৩"],
    });

    // And then she dies of it. The register wants "animal, date, cause, disposal, DLS report
    // ref" in one row, and it gets there through the Diagnosis rather than through a flag
    // somebody has to remember to tick.
    await manager.client.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: disease,
      diagnosisId: made.id,
      disposal: "buried",
      disposalNote: "ছয় ফুট গভীরে",
    });

    const her = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(her.mortality).toMatchObject({
      kind: "died",
      disposal: "buried",
      disease,
      reportReference: "ULO/2027/৩৩",
    });
  });
});
