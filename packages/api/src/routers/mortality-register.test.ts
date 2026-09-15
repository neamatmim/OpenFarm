import { and, eq, inArray } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The mortality register (R6): every death, its cause, how the carcass went, and the DLS reference when the
// disease was notifiable — a stillborn calf's disposal added afterwards. And the movement log (R11): every Move,
// Side change, arrival, sale and death in a period, in time order.

const suffix = `${Date.now()}`;
const REGISTRATION = "DLS/SAV/2026/০৪২";
const FEBRUARY = { from: "2046-02-01", to: "2046-02-28" };

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const choice = (values: string[], required: boolean) => ({
  type: "choice" as const,
  required,
  choices: values.map((value) => ({ value, label: { bn: value } })),
});

const calvingRoundSop = (): SopContent => ({
  name: { bn: `বাচ্চার ঘর ${suffix}` },
  purpose: { bn: "বাচ্চা দেওয়া গাভীর রেকর্ড" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "calved",
      text: { bn: "বাচ্চা দিয়েছে কি?" },
      repeatPerAnimal: true,
      evidence: [
        { type: "datetime", required: true },
        choice(["unassisted", "assisted", "vet"], true),
        choice(["female", "male"], true),
        choice(["alive", "stillborn"], true),
        choice(["female", "male"], false),
        choice(["alive", "stillborn"], false),
        choice(["female", "male"], false),
        choice(["alive", "stillborn"], false),
      ],
      skipReasons: [{ bn: "এখনো বাচ্চা দেয়নি" }],
      effect: { kind: "calving" },
    },
  ],
});

const reportSop = (): SopContent => ({
  name: { bn: `ডিএলএস-কে জানানো ${suffix}` },
  purpose: { bn: "উপজেলা প্রাণিসম্পদ অফিসারকে জানান" },
  triggers: [{ kind: "notifiable_disease" }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 0,
  steps: [
    {
      id: "deliver",
      text: { bn: "চিঠি পৌঁছে দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "note", required: true }],
      skipReasons: [],
      effect: { kind: "dls_report" },
    },
  ],
});

const setup = async () => {
  const start = "2046-01-05T04:00:00.000Z";
  const owner = await as("owner", start);
  const manager = await as("manager", start);
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({ registrationNumber: REGISTRATION });
  }
  const shed = await owner.client.herd.createShed({ name: `r6-${suffix}` });
  const pen = (name: string) =>
    owner.client.herd.createPen({ shedId: shed.id, name: `${name} ${suffix}` });
  const pens = {
    calving: await pen("বাচ্চার ঘর"),
    dairy: await pen("গাভীর ঘর"),
    fattening: await pen("মোটাতাজা"),
  };
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-r6-${pens.calving.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pens.calving.id,
    })
    .onConflictDoNothing();
  const dam = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "pregnant_heifer",
    penId: pens.calving.id,
    source: "bought",
    aliases: [],
    expectedCalvingOn: "2046-02-12",
  });
  const bull = await owner.client.animals.register({
    sex: "male",
    side: "dairy",
    state: "calf",
    penId: pens.dairy.id,
    source: "born",
    aliases: [],
  });
  const disease = `তড়কা ${suffix}`;
  await manager.client.notifiable.add({ name: { bn: disease } });
  const sops = {
    round: await owner.client.sops.create({ content: calvingRoundSop() }),
    report: await owner.client.sops.create({ content: reportSop() }),
  };
  return { pens, dam, bull, disease, sops };
};

let world: Awaited<ReturnType<typeof setup>>;
const tags: Record<string, string> = {};

beforeAll(async () => {
  world = await setup();

  // 1 February: a heifer registered in the dairy pen; 2 February, walked to the calving pen.
  const first = await as("owner", "2046-02-01T04:00:00.000Z");
  const heifer = await first.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pens.dairy.id,
    source: "born",
    aliases: [],
  });
  tags.heifer = heifer.tagNumber;
  const second = await as("owner", "2046-02-02T04:00:00.000Z");
  await second.client.animals.move({
    tagNumber: heifer.tagNumber,
    toPenId: world.pens.calving.id,
  });

  // 3 February: the bull calf goes to the fattening side.
  const third = await as("owner", "2046-02-03T04:00:00.000Z");
  await third.client.animals.move({
    tagNumber: world.bull.tagNumber,
    toPenId: world.pens.fattening.id,
    toSide: "fattening",
  });

  // 4 February: a bull bought in at the hat; 5 February, sold on.
  const fourth = await as("manager", "2046-02-04T04:00:00.000Z");
  const bought = await fourth.client.intake.record({
    penId: world.pens.fattening.id,
    sex: "male",
    seller: { name: `রহমান ব্যাপারী ${suffix}` },
    purchasePriceBdt: 90_000,
    weightKg: 220,
    estimatedAgeMonths: 24,
    targetWindowStart: "2046-05-01",
    targetWindowEnd: "2046-05-31",
  });
  tags.bought = bought.tagNumber;
  const fifth = await as("manager", "2046-02-05T04:00:00.000Z");
  await fifth.client.sale.record({
    tagNumber: bought.tagNumber,
    buyer: { name: `কাদের কসাই ${suffix}`, address: "গাবতলী, ঢাকা" },
    priceBdt: 120_000,
    weightKg: 240,
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৩",
    driver: "সোহেল",
  });

  // 6 February: anthrax in the heifer, reported under the office's reference; 7 February, she died of it.
  const vet = await as("vet", "2046-02-06T04:00:00.000Z");
  const anthrax = await vet.client.diagnoses.record({
    animalTag: heifer.tagNumber,
    disease: { bn: world.disease },
  });
  const reporter = await as("manager", "2046-02-06T05:00:00.000Z");
  await reporter.client.instances.claim({ id: anthrax.reportInstanceId ?? "" });
  await reporter.client.instances.completeStep({
    instanceId: anthrax.reportInstanceId ?? "",
    stepId: "deliver",
    evidence: ["ULO/2046/০১২"],
  });
  const seventh = await as("manager", "2046-02-07T04:00:00.000Z");
  await seventh.client.animals.recordMortality({
    tagNumber: heifer.tagNumber,
    kind: "died",
    cause: "তড়কা",
    diagnosisId: anthrax.id,
    disposal: "burned",
    disposalNote: "খামারের পেছনে, পশু হাসপাতালের লোক",
    happenedAt: new Date("2046-02-07T02:00:00.000Z"),
  });

  // 8 February: the bull calf, not thriving, culled.
  const eighth = await as("manager", "2046-02-08T04:00:00.000Z");
  await eighth.client.animals.recordMortality({
    tagNumber: world.bull.tagNumber,
    kind: "culled",
    cause: "বাড়ছে না",
    disposal: "buried",
  });

  // 10 February: the pregnant heifer calves a stillborn bull calf on the morning round.
  const clock = new FakeClock("2046-02-10T01:00:00.000Z");
  const roundManager = await createTestClient(appRouter, {
    as: "manager",
    clock,
  });
  await roundManager.client.instances.ensureDue();
  const listed = await roundManager.client.instances.today({
    penId: world.pens.calving.id,
  });
  const round = listed.find(
    (row) => row.definitionId === world.sops.round.definitionId
  );
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: round?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: round?.id ?? "",
    stepId: "calved",
    animalTag: world.dam.tagNumber,
    evidence: [
      "2046-02-10T00:30:00.000Z",
      "assisted",
      "male",
      "stillborn",
      "",
      "",
      "",
      "",
    ],
  });
  // The hour was written wrong: she calved at ten past six. Her calf's arrival and her death move with it.
  const board = await roundManager.client.instances.get({
    id: round?.id ?? "",
  });
  await staff.client.instances.correctStep({
    completionId:
      board.completions.find((row) => row.stepId === "calved")?.id ?? "",
    evidence: [
      "2046-02-10T00:10:00.000Z",
      "assisted",
      "male",
      "stillborn",
      "",
      "",
      "",
      "",
    ],
    reason: "সময় ভুল লেখা হয়েছিল",
  });
  const dam = await roundManager.client.animals.byTag({
    tagNumber: world.dam.tagNumber,
  });
  tags.stillborn = dam.calvings[0]?.calves[0]?.tagNumber ?? "";
});

afterAll(async () => {
  const db = scratchDb();
  const definitions = Object.values(world.sops).map((sop) => sop.definitionId);
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(inArray(sopDefinition.id, definitions));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        inArray(sopInstance.definitionId, definitions),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-r6-${world.pens.calving.id}`));
});

const ours = (tag: string) =>
  [tags.heifer, tags.bought, tags.stillborn, world.bull.tagNumber].includes(
    tag
  );

describe("the mortality register", () => {
  it("lists every death with its cause, disposal and DLS reference, a stillbirth awaiting its disposal", async () => {
    const manager = await as("manager", "2046-03-01T04:00:00.000Z");
    const register = await manager.client.inspector.mortalities(FEBRUARY);
    expect(register).toMatchObject(FEBRUARY);
    expect(register.rows.filter((row) => ours(row.tagNumber))).toEqual([
      {
        id: expect.any(String),
        tagNumber: tags.heifer,
        diedOn: "2046-02-07",
        kind: "died",
        cause: "তড়কা",
        disposal: "burned",
        disposalNote: "খামারের পেছনে, পশু হাসপাতালের লোক",
        reportReference: "ULO/2046/০১২",
      },
      {
        id: expect.any(String),
        tagNumber: world.bull.tagNumber,
        diedOn: "2046-02-08",
        kind: "culled",
        cause: "বাড়ছে না",
        disposal: "buried",
        disposalNote: null,
        reportReference: null,
      },
      {
        id: expect.any(String),
        tagNumber: tags.stillborn,
        diedOn: "2046-02-10",
        kind: "died",
        cause: "stillbirth",
        disposal: null,
        disposalNote: null,
        reportReference: null,
      },
    ]);
    // A year to today unless asked, today counted.
    expect(await manager.client.inspector.mortalities({})).toMatchObject({
      from: "2045-03-02",
      to: "2046-03-01",
    });

    const awaiting = await manager.client.inspector.print({
      report: "mortality_register",
      format: "csv",
      ...FEBRUARY,
    });
    expect(awaiting.csv).toContain(
      `${tags.stillborn},2046-02-10,died,stillbirth,awaiting,,\r\n`
    );

    await manager.client.language.set({ language: "bn" });
    const paper = await manager.client.inspector.print({
      report: "mortality_register",
      ...FEBRUARY,
    });
    expect(paper.text).toContain("মৃত্যুর রেজিস্টার / Mortality register");
    expect(paper.text).toContain(
      [
        tags.heifer,
        "  তারিখ / Date: ৭ ফেব্রুয়ারি, ২০৪৬",
        "  কারণ / Cause: তড়কা",
        "  নিষ্পত্তি / Disposal: পোড়ানো হয়েছে / Burned — খামারের পেছনে, পশু হাসপাতালের লোক",
        "  ডিএলএস রেফারেন্স / DLS reference: ULO/2046/০১২",
      ].join("\n")
    );
    expect(paper.text).toContain(
      [
        tags.stillborn,
        "  তারিখ / Date: ১০ ফেব্রুয়ারি, ২০৪৬",
        "  কারণ / Cause: মৃত জন্ম / Stillbirth",
        "  নিষ্পত্তি / Disposal: অপেক্ষমাণ / Awaiting",
      ].join("\n")
    );
  });

  it("takes the stillborn calf's disposal from the Manager afterwards, once", async () => {
    const staff = await as("staff", "2046-02-11T04:00:00.000Z");
    await expect(
      staff.client.animals.recordDisposal({
        tagNumber: tags.stillborn ?? "",
        disposal: "buried",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const manager = await as("manager", "2046-02-11T04:00:00.000Z");
    await manager.client.animals.recordDisposal({
      tagNumber: tags.stillborn ?? "",
      disposal: "buried",
      disposalNote: "ছয় ফুট, বাছুরের ঘরের পেছনে",
    });
    await expect(
      manager.client.animals.recordDisposal({
        tagNumber: tags.stillborn ?? "",
        disposal: "burned",
      })
    ).rejects.toMatchObject({
      data: { refusal: "disposal_already_recorded" },
    });

    const later = await as("manager", "2046-03-01T04:00:00.000Z");
    const register = await later.client.inspector.mortalities(FEBRUARY);
    expect(
      register.rows.find((row) => row.tagNumber === tags.stillborn)
    ).toMatchObject({
      disposal: "buried",
      disposalNote: "ছয় ফুট, বাছুরের ঘরের পেছনে",
    });

    const sheet = await later.client.inspector.print({
      report: "mortality_register",
      format: "csv",
      ...FEBRUARY,
    });
    const [header, ...rows] = (sheet.csv ?? "").slice(1).trim().split("\r\n");
    expect(header).toBe(
      "tag,date,kind,cause,disposal,disposal_note,dls_reference"
    );
    expect(rows.filter((row) => row.startsWith(`${tags.heifer},`))).toEqual([
      `${tags.heifer},2046-02-07,died,তড়কা,burned,"খামারের পেছনে, পশু হাসপাতালের লোক",ULO/2046/০১২`,
    ]);

    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    expect(
      exports
        .map((event) => event.after as Record<string, unknown> | null)
        .filter(
          (after) =>
            after?.report === "mortality_register" &&
            after.from === FEBRUARY.from
        )
        .map((after) => after?.format)
        .toSorted()
    ).toEqual(["csv", "csv", "paper"]);
  });
});

describe("the movement log", () => {
  it("lists every Move, Side change, calving, intake, sale, death and cull in time order, as a CSV and an Export", async () => {
    const manager = await as("manager", "2046-03-01T04:00:00.000Z");
    const log = await manager.client.inspector.movementLog(FEBRUARY);
    const [header, ...rows] = log.csv.slice(1).trim().split("\r\n");
    expect(header).toBe("when,tag,kind,from,to,recorded_by");
    const pen = (name: string) => `${name} ${suffix}`;
    expect(
      rows
        .map((row) => row.split(","))
        .filter(([, tag]) => ours(tag ?? ""))
        .map(([when, tag, kind, from, to]) => [when, tag, kind, from, to])
    ).toEqual([
      // Registering the heifer on 1 February moved her nowhere.
      ["2046-02-02 10:00", tags.heifer, "move", pen("গাভীর ঘর"), pen("বাচ্চার ঘর")],
      [
        "2046-02-03 10:00",
        world.bull.tagNumber,
        "side_change",
        `${pen("গাভীর ঘর")} (dairy)`,
        `${pen("মোটাতাজা")} (fattening)`,
      ],
      [
        "2046-02-04 10:00",
        tags.bought,
        "intake",
        `রহমান ব্যাপারী ${suffix}`,
        pen("মোটাতাজা"),
      ],
      ["2046-02-05 10:00", tags.bought, "sale", pen("মোটাতাজা"), "গাবতলী পশুর হাট"],
      ["2046-02-07 08:00", tags.heifer, "died", pen("বাচ্চার ঘর"), ""],
      ["2046-02-08 10:00", world.bull.tagNumber, "culled", pen("মোটাতাজা"), ""],
      ["2046-02-10 06:10", tags.stillborn, "calving", "", pen("বাচ্চার ঘর")],
      ["2046-02-10 06:10", tags.stillborn, "died", pen("বাচ্চার ঘর"), ""],
    ]);
    expect(log.period).toEqual(FEBRUARY);

    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    expect(
      exports
        .map((event) => event.after as Record<string, unknown> | null)
        .filter(
          (after) =>
            after?.report === "movement_log" && after.from === FEBRUARY.from
        )
    ).toEqual([expect.objectContaining({ format: "csv", to: FEBRUARY.to })]);
  });

  it("is the Owner's and the Manager's, never Barn Staff's", async () => {
    const staff = await as("staff", "2046-03-01T04:00:00.000Z");
    await expect(
      staff.client.inspector.mortalities(FEBRUARY)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.client.inspector.movementLog(FEBRUARY)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
