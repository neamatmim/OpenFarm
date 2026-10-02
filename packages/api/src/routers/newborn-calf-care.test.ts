import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// Newborn calf care from the Standard Playbook: two jobs raised for each live calf the moment her Calving is
// recorded — the first colostrum and the rest, late at two hours; the second feed, late at twelve — and neither for a
// stillborn calf or a bought bull.

const suffix = `newborn-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const choice = (values: string[], required: boolean) => ({
  type: "choice" as const,
  required,
  choices: values.map((value) => ({ value, label: { bn: value } })),
});

/** The calving pen, walked every morning: a cow who has calved is recorded. */
const calvingRoundSop = (): SopContent => ({
  name: { bn: `বাচ্চার ঘর দেখা ${suffix}`, en: "Calving pen round" },
  purpose: { bn: "বাচ্চা দেওয়া গাভী ও বাছুরের রেকর্ড রাখা" },
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

const BORN = "2052-03-10";
/** When the morning round records the calvings: seven in the morning, farm time. */
const RECORDED = `${BORN}T01:00:00.000Z`;

let penId = "";
let roundId = "";
let newbornId = "";
let secondFeedId = "";
const cows: string[] = [];

beforeAll(async () => {
  const owner = await as("owner", "2052-03-01T04:00:00.000Z");
  const playbook = standardPlaybook();
  const newborn = await owner.client.sops.create({
    content: playbook.newbornCalfCare,
  });
  const second = await owner.client.sops.create({
    content: playbook.newbornSecondFeed,
  });
  newbornId = newborn.definitionId;
  secondFeedId = second.definitionId;
  const round = await owner.client.sops.create({ content: calvingRoundSop() });
  roundId = round.definitionId;
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `বাচ্চার ঘর ${suffix}`,
  });
  penId = pen.id;
  await as("staff", "2052-03-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-newborn-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  for (const _ of [1, 2]) {
    // oxlint-disable-next-line no-await-in-loop
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "pregnant_heifer",
      penId: pen.id,
      source: "bought",
      aliases: [],
      expectedCalvingOn: "2052-03-12",
    });
    cows.push(cow.tagNumber);
  }
  // A bought bull in the same Pen: his arrival must never raise calf work.
  const manager = await as("manager", "2052-03-01T05:00:00.000Z");
  await manager.client.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 60_000,
    weightKg: 220,
    estimatedAgeMonths: 18,
    arrivedAt: new Date("2052-03-01T05:00:00.000Z"),
    targetWindowStart: "2052-06-01",
    targetWindowEnd: "2052-06-05",
  });

  // The morning round finds the first cow with a live heifer calf and the second with a stillborn one.
  const early = await as("manager", RECORDED);
  await early.client.instances.ensureDue();
  const today = await early.client.instances.today({ penId });
  const theRound = today.find((row) => row.definitionId === roundId);
  const staff = await as("staff", RECORDED);
  await staff.client.instances.claim({ id: theRound?.id ?? "" });
  const [live, dead] = cows;
  for (const [tag, outcome] of [
    [live, "alive"],
    [dead, "stillborn"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop
    await staff.client.instances.completeStep({
      instanceId: theRound?.id ?? "",
      stepId: "calved",
      animalTag: tag ?? "",
      evidence: [
        `${BORN}T00:30:00.000Z`,
        "unassisted",
        "female",
        outcome,
        "",
        "",
      ],
    });
  }
});

/** The newborn work raised by now, as the Manager sees the Pen. */
const newbornWork = async (instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  return today.filter(
    (row) => row.definitionId === newbornId || row.definitionId === secondFeedId
  );
};

/** The live calf's tag, read from her dam. */
const theCalf = async () => {
  const manager = await as("manager", `${BORN}T02:00:00.000Z`);
  const dam = await manager.client.animals.byTag({ tagNumber: cows[0] ?? "" });
  return dam.calvings[0]?.calves[0]?.tagNumber ?? "";
};

describe("newborn calf care", () => {
  it("raises both jobs for the live calf, and none for the stillborn calf, the bought bull or a bought heifer", async () => {
    // A pregnant heifer bought that same morning arrives on the Dairy side too: an arrival, and not a newborn.
    const owner = await as("owner", `${BORN}T01:05:00.000Z`);
    await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "pregnant_heifer",
      penId,
      source: "bought",
      aliases: [],
      expectedCalvingOn: "2052-05-01",
    });
    const work = await newbornWork(`${BORN}T01:10:00.000Z`);
    // One of each, both about her: the stillborn calf left in the act of being born, and the bull is Fattening's.
    expect(work.map((row) => row.definitionId).toSorted()).toEqual(
      [newbornId, secondFeedId].toSorted()
    );
    const first = work.find((row) => row.definitionId === newbornId);
    const second = work.find((row) => row.definitionId === secondFeedId);
    // Due when her Calving was recorded; late two hours on, and the second feed twelve.
    const due = first?.dueAt.getTime() ?? 0;
    expect(first?.graceMinutes).toBe(120);
    expect(second?.graceMinutes).toBe(720);
    expect(Math.abs(due - new Date(RECORDED).getTime())).toBeLessThan(
      60 * 60 * 1000
    );
  });

  it("weighs her, and writes down a calf not sucking as an Observation", async () => {
    const tag = await theCalf();
    const work = await newbornWork(`${BORN}T01:20:00.000Z`);
    const first = work.find((row) => row.definitionId === newbornId);
    const staff = await as("staff", `${BORN}T01:20:00.000Z`);
    await staff.client.instances.claim({ id: first?.id ?? "" });
    await staff.client.instances.completeStep({
      instanceId: first?.id ?? "",
      stepId: "well",
      animalTag: tag,
      evidence: ["not_suckling"],
    });
    await staff.client.instances.completeStep({
      instanceId: first?.id ?? "",
      stepId: "weigh",
      animalTag: tag,
      evidence: [28],
    });
    const db = scratchDb();
    const her = await db.query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: tag },
      columns: { id: true },
    });
    const weighed = await db.query.weighIn.findMany({
      where: { animalId: her?.id ?? "" },
      columns: { weightKg: true },
    });
    expect(weighed.map((one) => Number(one.weightKg))).toEqual([28]);
    const seen = await db.query.observation.findMany({
      where: { animalId: her?.id ?? "" },
      columns: { saw: true },
    });
    expect(seen.map((one) => one.saw)).toEqual(["not_suckling"]);

    // And her own page says her first day, in the procedure's words.
    const manager = await as("manager", `${BORN}T02:00:00.000Z`);
    const page = await manager.client.animals.byTag({ tagNumber: tag });
    expect(page.firstDay.map((line) => line.step.en)).toEqual([
      expect.stringContaining("Breathing"),
      "Weigh her (scale or tape)",
    ]);
    expect(page.firstDay[1]?.answers).toEqual([
      { kind: "number", value: 28, unit: { bn: "কেজি", en: "kg" } },
    ]);
  });

  it("is late two hours after her Calving was recorded, and the second feed is not", async () => {
    const manager = await as("manager", `${BORN}T03:05:00.000Z`);
    const home = await manager.client.home.manager();
    const late = home.queue.overdue.map((row) => row.id);
    const work = await newbornWork(`${BORN}T03:05:00.000Z`);
    const first = work.find((row) => row.definitionId === newbornId);
    const second = work.find((row) => row.definitionId === secondFeedId);
    expect(late).toContain(first?.id);
    expect(late).not.toContain(second?.id);
  });
});

describe("what the farm loses in calves", () => {
  it("counts the calf born dead apart, and the one lost before weaning with what she died of", async () => {
    const tag = await theCalf();
    const manager = await as("manager", "2052-03-20T04:00:00.000Z");
    await manager.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: tag,
      kind: "died",
      cause: "পাতলা পায়খানা",
      disposal: "buried",
    });
    const owner = await as("owner", "2052-04-01T04:00:00.000Z");
    const losses = await owner.client.herd.calfLosses();
    expect(losses).toMatchObject({
      bornAlive: 1,
      stillborn: 1,
      diedBeforeWeaning: 1,
      lostShare: 1,
      causes: [{ cause: "পাতলা পায়খানা", count: 1 }],
    });
  });
});
