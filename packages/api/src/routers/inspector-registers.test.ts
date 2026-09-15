import { eq, inArray } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Inspector View's health registers: the treatment register (R4), every dose in a period with the
// prescription and withdrawal behind it, and the disease history (R5), every diagnosis with the notifiable
// ones marked and what became of the animal.

const suffix = `${Date.now()}`;
const REGISTRATION = "DLS/SAV/2026/০৪২";
const MARCH = { from: "2044-03-01", to: "2044-03-31" };

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
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }],
      effect: { kind: "treatment" },
    },
  ],
});

const campaignSop = (productId: string): SopContent => ({
  name: { bn: `কৃমিনাশক ${suffix}`, en: "Worming" },
  purpose: { bn: "পেনের সব পশুকে কৃমিনাশক" },
  triggers: [],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "কৃমিনাশক খাওয়ান" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

const reportSop = (): SopContent => ({
  name: { bn: `ডিএলএস-কে জানানো ${suffix}`, en: "Report to DLS" },
  purpose: { bn: "উপজেলা প্রাণিসম্পদ অফিসারকে জানান" },
  triggers: [{ kind: "notifiable_disease" }],
  assignedRole: "manager",
  checkerRole: null,
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
  const start = "2044-02-20T04:00:00.000Z";
  const owner = await as("owner", start);
  const manager = await as("manager", start);
  const vet = await as("vet", start);
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({ registrationNumber: REGISTRATION });
  }
  const shed = await owner.client.herd.createShed({ name: `reg4-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `স্বাস্থ্য ${suffix}`,
  });
  const oxytetracycline = await vet.client.drugs.add({
    name: { bn: `অক্সিটেট্রাসাইক্লিন ${suffix}`, en: "Oxytetracycline" },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });
  const wormer = await vet.client.drugs.add({
    name: { bn: `আলবেন্ডাজল ${suffix}`, en: "Albendazole" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 14,
  });
  const sops = {
    treatment: await owner.client.sops.create({ content: treatmentSop() }),
    campaign: await owner.client.sops.create({
      content: campaignSop(wormer.id),
    }),
    report: await owner.client.sops.create({ content: reportSop() }),
  };
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-reg4-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  const cow = () =>
    owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
  const mastitisCow = await cow();
  const anthraxCow = await cow();
  const disease = `তড়কা ${suffix}`;
  await manager.client.notifiable.add({ name: { bn: disease } });
  return {
    pen,
    sops,
    oxytetracycline,
    wormer,
    mastitisCow,
    anthraxCow,
    disease,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();

  // 1 March: mastitis, and a course of oxytetracycline twice a day for two days, prescribed by the Vet — its
  // first dose given by Barn Staff, the rest never.
  const vet = await as("vet", "2044-03-01T01:00:00.000Z");
  const mastitis = await vet.client.diagnoses.record({
    animalTag: world.mastitisCow.tagNumber,
    disease: { bn: "ওলান প্রদাহ", en: "Mastitis" },
  });
  await vet.client.prescriptions.prescribe({
    animalTag: world.mastitisCow.tagNumber,
    diagnosisId: mastitis.id,
    productId: world.oxytetracycline.id,
    dose: "১০ মিলি",
    route: "intramuscular",
    times: ["08:00", "20:00"],
    days: 2,
  });
  const staff = await as("staff", "2044-03-01T02:30:00.000Z");
  const today = await staff.client.instances.today({ penId: world.pen.id });
  const dose = today.find(
    (row) => row.definitionId === world.sops.treatment.definitionId
  );
  await staff.client.instances.claim({ id: dose?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: dose?.id ?? "",
    stepId: "dose",
    evidence: [true],
  });

  // 10 March: anthrax, notifiable — the letter delivered under the office's reference.
  const later = await as("vet", "2044-03-10T04:00:00.000Z");
  const anthrax = await later.client.diagnoses.record({
    animalTag: world.anthraxCow.tagNumber,
    disease: { bn: world.disease },
  });
  const manager = await as("manager", "2044-03-10T05:00:00.000Z");
  await manager.client.instances.claim({ id: anthrax.reportInstanceId ?? "" });
  await manager.client.instances.completeStep({
    instanceId: anthrax.reportInstanceId ?? "",
    stepId: "deliver",
    evidence: ["ULO/2044/০০৭"],
  });

  // 12 March: she died of it.
  const dying = await as("manager", "2044-03-12T04:00:00.000Z");
  await dying.client.animals.recordMortality({
    tagNumber: world.anthraxCow.tagNumber,
    kind: "died",
    cause: "তড়কা",
    diagnosisId: anthrax.id,
    disposal: "buried",
    happenedAt: new Date("2044-03-12T03:00:00.000Z"),
  });

  // 15 March: the Vet names anthrax in the mastitis cow, then takes it back — the report nobody delivered is
  // withdrawn, so the history does not mark it.
  const mistaken = await as("vet", "2044-03-15T04:00:00.000Z");
  const wrong = await mistaken.client.diagnoses.record({
    animalTag: world.mastitisCow.tagNumber,
    disease: { bn: world.disease },
  });
  await mistaken.client.diagnoses.correct({
    id: wrong.id,
    changes: {
      disease: { from: world.disease, to: { bn: "জ্বর, কারণ অজানা" } },
    },
    reason: "পরীক্ষার ফল এসেছে",
  });

  // 20 March: the mastitis cow wormed on a campaign over her Pen, which nobody prescribed.
  const round = await as("manager", "2044-03-20T04:00:00.000Z");
  await round.client.instances.raiseNow({
    definitionId: world.sops.campaign.definitionId,
    penId: world.pen.id,
  });
  const listed = await round.client.instances.today({ penId: world.pen.id });
  const campaign = listed.find(
    (row) => row.definitionId === world.sops.campaign.definitionId
  );
  const wormer = await as("staff", "2044-03-20T04:30:00.000Z");
  await wormer.client.instances.claim({ id: campaign?.id ?? "" });
  await wormer.client.instances.completeStep({
    instanceId: campaign?.id ?? "",
    stepId: "dose",
    animalTag: world.mastitisCow.tagNumber,
    evidence: [true],
  });
});

afterAll(async () => {
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(
      inArray(
        sopDefinition.id,
        Object.values(world.sops).map((sop) => sop.definitionId)
      )
    );
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-reg4-${world.pen.id}`));
});

const ours = (tag: string) =>
  tag === world.mastitisCow.tagNumber || tag === world.anthraxCow.tagNumber;

describe("the health registers", () => {
  it("lists every dose in the period with its prescription and withdrawal, a campaign's without either", async () => {
    const manager = await as("manager", "2044-04-10T04:00:00.000Z");
    const march = await manager.client.inspector.treatments(MARCH);
    expect(march.rows.filter((row) => ours(row.tagNumber))).toEqual([
      {
        id: expect.any(String),
        givenOn: "2044-03-01",
        tagNumber: world.mastitisCow.tagNumber,
        diagnosis: "ওলান প্রদাহ",
        drug: `অক্সিটেট্রাসাইক্লিন ${suffix}`,
        dose: "১০ মিলি",
        route: "intramuscular",
        course: "1/4",
        givenBy: expect.any(String),
        prescribedBy: expect.any(String),
        milkClearOn: "2044-03-05",
        meatClearOn: "2044-03-22",
      },
      {
        id: expect.any(String),
        givenOn: "2044-03-20",
        tagNumber: world.mastitisCow.tagNumber,
        diagnosis: null,
        drug: `আলবেন্ডাজল ${suffix}`,
        dose: null,
        route: null,
        course: null,
        givenBy: expect.any(String),
        prescribedBy: null,
        milkClearOn: "2044-03-23",
        meatClearOn: "2044-04-03",
      },
    ]);

    // Thirty days to today unless asked, today counted: the dose of 1 March is past it, the campaign is not.
    const lately = await manager.client.inspector.treatments({});
    expect(lately).toMatchObject({ from: "2044-03-12", to: "2044-04-10" });
    // Asked only where to end, the thirty days end there (2044 is a leap year).
    const back = await manager.client.inspector.treatments({
      to: "2044-03-01",
    });
    expect(back).toMatchObject({ from: "2044-02-01", to: "2044-03-01" });
    expect(
      back.rows.filter((row) => ours(row.tagNumber)).map((row) => row.givenOn)
    ).toEqual(["2044-03-01"]);
    expect(
      lately.rows.filter((row) => ours(row.tagNumber)).map((row) => row.givenOn)
    ).toEqual(["2044-03-20"]);
  });

  it("takes an asked period's first and last days whole, and refuses one that runs backwards", async () => {
    const manager = await as("manager", "2044-04-10T04:00:00.000Z");
    const givenOn = async (period: { from: string; to: string }) => {
      const register = await manager.client.inspector.treatments(period);
      return register.rows
        .filter((row) => ours(row.tagNumber))
        .map((row) => row.givenOn);
    };
    expect(await givenOn({ from: "2044-03-01", to: "2044-03-01" })).toEqual([
      "2044-03-01",
    ]);
    expect(await givenOn({ from: "2044-03-02", to: "2044-03-20" })).toEqual([
      "2044-03-20",
    ]);
    expect(await givenOn({ from: "2044-03-02", to: "2044-03-19" })).toEqual([]);

    const diagnosedOn = async (period: { from: string; to: string }) => {
      const history = await manager.client.inspector.diseases(period);
      return history.rows
        .filter((row) => ours(row.tagNumber))
        .map((row) => row.diagnosedOn);
    };
    expect(await diagnosedOn({ from: "2044-03-02", to: "2044-03-10" })).toEqual(
      ["2044-03-10"]
    );
    expect(await diagnosedOn({ from: "2044-03-01", to: "2044-03-09" })).toEqual(
      ["2044-03-01"]
    );

    await expect(
      manager.client.inspector.treatments({
        from: "2044-03-20",
        to: "2044-03-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "period_backwards" } });
  });

  it("prints the treatment register and gives it as a CSV in the DLS template's order, each an Export", async () => {
    const manager = await as("manager", "2044-04-10T04:00:00.000Z");
    // A paper is in its producer's language, and other files choose the Manager's: this one says Bangla.
    await manager.client.language.set({ language: "bn" });
    const paper = await manager.client.inspector.print({
      report: "treatment_register",
      ...MARCH,
    });
    expect(paper.text).toContain("চিকিৎসার রেজিস্টার / Treatment register");
    // Days and the route written out for the reader; the course and both clear days beside the dose.
    expect(paper.text).toContain("সময়কাল / Period: ১ মার্চ, ২০৪৪ — ৩১ মার্চ, ২০৪৪");
    // A line to each field, in the order the CSV has them.
    expect(paper.text).toContain(
      [
        `১ মার্চ, ২০৪৪ · ${world.mastitisCow.tagNumber}`,
        "  রোগ / Diagnosis: ওলান প্রদাহ",
        `  ওষুধ / Drug: অক্সিটেট্রাসাইক্লিন ${suffix}`,
        "  ডোজ / Dose: ১০ মিলি",
        "  পথ / Route: মাংসে ইনজেকশন / Intramuscular",
        "  কোর্স / Course: 1/4",
      ].join("\n")
    );
    expect(paper.text).toContain(
      "  দুধ মুক্ত / Milk clear: ৫ মার্চ, ২০৪৪\n  মাংস মুক্ত / Meat clear: ২২ মার্চ, ২০৪৪"
    );

    const sheet = await manager.client.inspector.print({
      report: "treatment_register",
      format: "csv",
      ...MARCH,
    });
    const [header, ...rows] = (sheet.csv ?? "").slice(1).trim().split("\r\n");
    expect(header).toBe(
      "date,tag,diagnosis,drug,dose,route,course,given_by,prescribed_by,milk_withdrawal_ends,meat_withdrawal_ends"
    );
    // Plain words and farm days for a spreadsheet; the campaign's dose with its prescription columns empty.
    const ourRows = rows.filter((row) =>
      row.includes(`,${world.mastitisCow.tagNumber},`)
    );
    expect(ourRows).toHaveLength(2);
    expect(ourRows[0]).toMatch(
      new RegExp(
        `^2044-03-01,${world.mastitisCow.tagNumber},ওলান প্রদাহ,অক্সিটেট্রাসাইক্লিন ${suffix},১০ মিলি,intramuscular,1/4,[^,]+,[^,]+,2044-03-05,2044-03-22$`,
        "u"
      )
    );
    expect(ourRows[1]).toMatch(
      new RegExp(
        `^2044-03-20,${world.mastitisCow.tagNumber},,আলবেন্ডাজল ${suffix},,,,[^,]+,,2044-03-23,2044-04-03$`,
        "u"
      )
    );

    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    expect(
      exports
        .map((event) => event.after as Record<string, unknown> | null)
        .filter(
          (after) =>
            after?.report === "treatment_register" && after.from === MARCH.from
        )
        .map((after) => after?.format)
        .toSorted()
    ).toEqual(["csv", "paper"]);
  });

  it("lists every diagnosis with the notifiable ones marked, their reference, and what became of the animal", async () => {
    const owner = await as("owner", "2044-04-10T04:00:00.000Z");
    const history = await owner.client.inspector.diseases({});
    // Six months back from today unless asked.
    expect(history).toMatchObject({ from: "2043-10-11", to: "2044-04-10" });
    // A month too short for the day ends it: six months before the 31st of August is the end of February.
    const summer = await owner.client.inspector.diseases({ to: "2044-08-31" });
    expect(summer).toMatchObject({ from: "2044-03-01", to: "2044-08-31" });
    expect(history.rows.filter((row) => ours(row.tagNumber))).toEqual([
      {
        id: expect.any(String),
        diagnosedOn: "2044-03-01",
        tagNumber: world.mastitisCow.tagNumber,
        disease: "ওলান প্রদাহ",
        diagnosedBy: expect.any(String),
        notifiable: false,
        reportReference: null,
        outcome: { kind: "on_the_farm", on: null },
      },
      {
        id: expect.any(String),
        diagnosedOn: "2044-03-10",
        tagNumber: world.anthraxCow.tagNumber,
        disease: world.disease,
        diagnosedBy: expect.any(String),
        notifiable: true,
        reportReference: "ULO/2044/০০৭",
        outcome: { kind: "died", on: "2044-03-12" },
      },
      {
        id: expect.any(String),
        diagnosedOn: "2044-03-15",
        tagNumber: world.mastitisCow.tagNumber,
        disease: "জ্বর, কারণ অজানা",
        diagnosedBy: expect.any(String),
        notifiable: false,
        reportReference: null,
        outcome: { kind: "on_the_farm", on: null },
      },
    ]);

    // Other files choose the Owner's language too.
    await owner.client.language.set({ language: "bn" });
    const paper = await owner.client.inspector.print({
      report: "disease_history",
    });
    expect(paper.text).toContain("রোগের ইতিহাস / Disease history");
    expect(paper.text).toContain(
      `১০ মার্চ, ২০৪৪ · ${world.anthraxCow.tagNumber} · ${world.disease} · জ্ঞাপনযোগ্য / Notifiable`
    );
    expect(paper.text).toContain(
      "ডিএলএস রেফারেন্স / DLS reference: ULO/2044/০০৭"
    );
    expect(paper.text).toContain("পরিণতি / Outcome: মৃত / Died ১২ মার্চ, ২০৪৪");
    // The diagnosis the Vet took back is not marked.
    expect(paper.text).toContain(
      `১৫ মার্চ, ২০৪৪ · ${world.mastitisCow.tagNumber} · জ্বর, কারণ অজানা\n`
    );
    await expect(
      owner.client.inspector.print({ report: "disease_history", format: "csv" })
    ).rejects.toMatchObject({ data: { refusal: "register_has_no_csv" } });

    // The print is an Export keeping its period; the refused CSV is not one.
    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    expect(
      exports
        .map((event) => event.after as Record<string, unknown> | null)
        .filter(
          (after) =>
            after?.report === "disease_history" && after.from === "2043-10-11"
        )
    ).toEqual([
      expect.objectContaining({
        format: "paper",
        from: "2043-10-11",
        to: "2044-04-10",
      }),
    ]);
  });

  it("is the Owner's and the Manager's, never Barn Staff's", async () => {
    const staff = await as("staff", "2044-04-10T04:00:00.000Z");
    await expect(staff.client.inspector.treatments({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(staff.client.inspector.diseases({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
