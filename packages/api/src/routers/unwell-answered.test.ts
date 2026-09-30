import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// Anything the round sees of an animal other than a heat is work for the Manager: late in a day, or in an hour for
// bloat and laboured breathing. The Vet's Diagnosis answers it and calls it off; so does taking the sighting back; and
// the Manager answers it by saying what was done.

const suffix = `unwell-${Date.now()}`;
const WELL = "সুস্থ — চোখে পড়ার মতো কিছু নেই";

let roundId = "";
let dayId = "";
let urgentId = "";

type Role = "owner" | "manager" | "vet";
const as = (role: Role, instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2058-03-01T00:00:00.000Z");
  const playbook = standardPlaybook();
  const [round, day, urgent] = await Promise.all([
    owner.client.sops.create({ content: playbook.healthRound }),
    owner.client.sops.create({ content: playbook.seeToUnwell }),
    owner.client.sops.create({ content: playbook.seeToUnwellUrgent }),
  ]);
  roundId = round.definitionId;
  dayId = day.definitionId;
  urgentId = urgent.definitionId;
});

/** A cow in a Pen of her own, so each question's work is hers alone. */
const aCow = async (name: string) => {
  const owner = await as("owner", "2058-03-01T00:00:00.000Z");
  const shed = await owner.client.herd.createShed({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.herd.createPen({ shedId: shed.id, name });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return { penId: pen.id, tag: cow.tagNumber };
};

/** The morning round in her Pen, recording what was seen of her at half past eight. */
const theRound = async (
  day: string,
  cow: { penId: string; tag: string },
  answer: { evidence: string[] } | { skipReason: string }
) => {
  const manager = await as("manager", `${day}T02:30:00.000Z`);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId: cow.penId });
  const work = today.find((row) => row.definitionId === roundId);
  const id = work?.id ?? "";
  await manager.client.instances.claim({ id });
  await manager.client.instances.completeStep({
    instanceId: id,
    stepId: "look",
    animalTag: cow.tag,
    evidence: [],
    ...answer,
  });
  const done = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId: id, stepId: "look" },
    columns: { id: true },
  });
  const her = await manager.client.animals.byTag({ tagNumber: cow.tag });
  const seen = her.observations.find((one) => !one.withdrawn);
  return { completionId: done?.id ?? "", observationId: seen?.id ?? "" };
};

/** The Manager's work about her, as the day raises it at an instant. */
const workFor = async (instant: string, cow: { tag: string }) => {
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: cow.tag },
    columns: { id: true },
  });
  return scratchDb().query.sopInstance.findMany({
    where: {
      farmId: theFarm().id,
      animalId: her?.id ?? "",
      definitionId: { in: [dayId, urgentId] },
    },
    columns: {
      id: true,
      definitionId: true,
      state: true,
      dueAt: true,
      graceMinutes: true,
      assignedRole: true,
    },
  });
};

describe("what the round saw, as the Manager's work", () => {
  it("raises a day's work for a lame cow, due when she was seen", async () => {
    const cow = await aCow("খোঁড়া পেন");
    await theRound("2058-03-02", cow, { evidence: ["lame"] });
    const work = await workFor("2058-03-02T03:00:00.000Z", cow);
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({
      definitionId: dayId,
      state: "due",
      graceMinutes: 24 * 60,
      assignedRole: "manager",
      dueAt: new Date("2058-03-02T02:30:00.000Z"),
    });
    // The job says what the round saw: it is what the Manager is answering.
    const manager = await as("manager", "2058-03-02T03:00:00.000Z");
    const board = await manager.client.instances.get({ id: work[0]?.id ?? "" });
    expect(board.seen).toMatchObject({
      label: "খোঁড়াচ্ছে",
      seenAt: new Date("2058-03-02T02:30:00.000Z"),
    });
  });

  it("raises an hour's work, and not a day's, for bloat", async () => {
    const cow = await aCow("ফাঁপা পেন");
    await theRound("2058-03-03", cow, { evidence: ["bloat"] });
    const work = await workFor("2058-03-03T03:00:00.000Z", cow);
    expect(work.map((one) => [one.definitionId, one.graceMinutes])).toEqual([
      [urgentId, 60],
    ]);
  });

  it("raises nothing here for a heat, which is the breeding chain's", async () => {
    const cow = await aCow("গরম পেন");
    await theRound("2058-03-04", cow, { evidence: ["heat"] });
    expect(await workFor("2058-03-04T03:00:00.000Z", cow)).toHaveLength(0);
  });

  it("is finished by the Manager saying what was done", async () => {
    const cow = await aCow("উত্তর পেন");
    await theRound("2058-03-05", cow, { evidence: ["off_feed"] });
    const [work] = await workFor("2058-03-05T03:00:00.000Z", cow);
    const manager = await as("manager", "2058-03-05T05:00:00.000Z");
    await manager.client.instances.claim({ id: work?.id ?? "" });
    await manager.client.instances.completeStep({
      instanceId: work?.id ?? "",
      stepId: "answer",
      animalTag: cow.tag,
      evidence: ["vet_called", "বিকেলে আসবেন"],
    });
    await manager.client.instances.complete({ id: work?.id ?? "" });
    const [after] = await workFor("2058-03-05T06:00:00.000Z", cow);
    expect(after?.state).toBe("completed");
  });
});

describe("called off", () => {
  it("by the Vet's Diagnosis answering what was seen", async () => {
    const cow = await aCow("ডাক্তার পেন");
    const { observationId } = await theRound("2058-03-06", cow, {
      evidence: ["lame"],
    });
    await workFor("2058-03-06T03:00:00.000Z", cow);
    const vet = await as("vet", "2058-03-06T04:00:00.000Z");
    await vet.client.diagnoses.record({
      animalTag: cow.tag,
      answers: observationId,
      disease: { bn: "ক্ষুরে পচন", en: "Foot rot" },
    });
    const [work] = await workFor("2058-03-06T05:00:00.000Z", cow);
    expect(work?.state).toBe("called_off");
  });

  it("and never raised when the Vet answered before the day looked", async () => {
    const cow = await aCow("আগে ডাক্তার পেন");
    const { observationId } = await theRound("2058-03-07", cow, {
      evidence: ["cough"],
    });
    const vet = await as("vet", "2058-03-07T02:40:00.000Z");
    await vet.client.diagnoses.record({
      animalTag: cow.tag,
      answers: observationId,
      disease: { bn: "ঠান্ডা লাগা", en: "A cold" },
    });
    expect(await workFor("2058-03-07T03:00:00.000Z", cow)).toHaveLength(0);
  });

  it("by the round put right to say she was well", async () => {
    const cow = await aCow("ভুল পেন");
    const { completionId } = await theRound("2058-03-08", cow, {
      evidence: ["diarrhoea"],
    });
    await workFor("2058-03-08T03:00:00.000Z", cow);
    const manager = await as("manager", "2058-03-08T04:00:00.000Z");
    await correctStepAsShown(manager.client, {
      completionId,
      reason: "অন্য গরু দেখা হয়েছিল",
      skipReason: WELL,
    });
    const [work] = await workFor("2058-03-08T05:00:00.000Z", cow);
    expect(work?.state).toBe("called_off");
  });
});

describe("left unanswered", () => {
  it("goes late to the Manager in an hour for bloat, then to the Owner", async () => {
    const cow = await aCow("দেরি পেন");
    await theRound("2058-03-09", cow, { evidence: ["breathing"] });
    const [work] = await workFor("2058-03-09T02:45:00.000Z", cow);
    const told = async (
      kind: "instance_overdue" | "instance_escalated",
      role: "owner" | "manager"
    ) => {
      const rows = await scratchDb().query.alert.findMany({
        where: { kind, userId: thePerson(role).id, entityId: work?.id ?? "" },
        columns: { id: true },
      });
      return rows.length;
    };
    const anHourOn = await as("manager", "2058-03-09T03:45:00.000Z");
    await anHourOn.client.alerts.sweep();
    expect(await told("instance_overdue", "manager")).toBe(1);
    expect(await told("instance_escalated", "owner")).toBe(0);
    const later = await as("manager", "2058-03-09T06:00:00.000Z");
    await later.client.alerts.sweep();
    expect(await told("instance_escalated", "owner")).toBe(1);
  });
});
