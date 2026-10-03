import type { SopContent } from "@OpenFarm/domain";
import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The cow herself, once a day for five days after she calves: what is seen of her is an Observation, and a cow down or
// an afterbirth held is the Manager's within the hour. Hung on her Calving — a cow put in Milking any other way has
// not just calved.

const suffix = `after-calving-${Date.now()}`;
/** She calves at three in the morning of the 2nd, farm time (UTC+6). */
const CALVED_AT = "2060-02-01T21:00:00.000Z";

/** The calving pen, walked each morning: a cow who has calved is recorded. */
const calvingRound = (): SopContent => ({
  name: { bn: `বাচ্চার ঘর দেখা ${suffix}` },
  purpose: { bn: "বাচ্চা দেওয়া গাভীর রেকর্ড রাখা" },
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
        ...(
          [
            [["unassisted", "assisted", "vet"], true],
            [["female", "male"], true],
            [["alive", "stillborn"], true],
            // A second and a third calf, for twins and triplets.
            [["female", "male"], false],
            [["alive", "stillborn"], false],
            [["female", "male"], false],
            [["alive", "stillborn"], false],
          ] as const
        ).map(([values, required]) => ({
          type: "choice" as const,
          required,
          choices: values.map((value) => ({ value, label: { bn: value } })),
        })),
      ],
      skipReasons: [{ bn: "এখনো বাচ্চা দেয়নি" }],
      effect: { kind: "calving" },
    },
  ],
});

let checkId = "";
let urgentId = "";
let roundId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2060-01-01T00:00:00.000Z");
  const playbook = standardPlaybook();
  const [check, urgent, round] = await Promise.all([
    owner.client.sops.create({ content: playbook.afterCalvingCheck }),
    owner.client.sops.create({ content: playbook.seeToUnwellUrgent }),
    owner.client.sops.create({ content: calvingRound() }),
  ]);
  checkId = check.definitionId;
  urgentId = urgent.definitionId;
  roundId = round.definitionId;
});

/** A cow on the opening register, in a Pen of her own: dry and due to calve, or already in milk. */
const aCow = async (name: string, state: "dry" | "milking") => {
  const owner = await as("owner", "2060-01-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
  const due = state === "dry" ? "2060-02-03" : "";
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,expected_calving",
      `female,dairy,${state},${name},bought,${due}`,
    ].join("\n"),
  });
  return { penId: pen.id, tag: imported.imported[0]?.tagNumber ?? "" };
};

/** The morning round in her Pen finds her calved at three. */
const sheCalves = async (cow: { penId: string; tag: string }) => {
  const manager = await as("manager", "2060-02-02T00:30:00.000Z");
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId: cow.penId });
  const round = today.find((row) => row.definitionId === roundId);
  await manager.client.work.claim({ id: round?.id ?? "" });
  await manager.client.work.completeStep({
    instanceId: round?.id ?? "",
    stepId: "calved",
    animalTag: cow.tag,
    evidence: [CALVED_AT, "unassisted", "female", "alive", "", "", "", ""],
  });
};

const idOf = async (tag: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true },
  });
  return her?.id ?? "";
};

/** When each of her checks falls due, as the days from the 2nd to the 8th have raised them. */
const checksOver = async (tag: string) => {
  const animalId = await idOf(tag);
  for (let day = 2; day <= 8; day += 1) {
    // Day after day, as the farm lives them.
    // oxlint-disable-next-line no-await-in-loop
    const manager = await as("manager", `2060-02-0${day}T04:00:00.000Z`);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.ensureDue();
  }
  const raised = await scratchDb().query.sopInstance.findMany({
    where: { animalId, definitionId: checkId },
    columns: { dueAt: true },
    orderBy: { dueAt: "asc" },
  });
  return raised.map((one) => one.dueAt.toISOString());
};

describe("the cow after calving", () => {
  it("is looked at once a day for five days from her Calving, and then no more", async () => {
    const cow = await aCow("বিয়ানো পেন", "dry");
    await sheCalves(cow);
    // Raised ahead with its day: the calving itself, then the start of each farm day after it — five, and no sixth.
    expect(await checksOver(cow.tag)).toEqual([
      CALVED_AT,
      "2060-02-02T18:00:00.000Z",
      "2060-02-03T18:00:00.000Z",
      "2060-02-04T18:00:00.000Z",
      "2060-02-05T18:00:00.000Z",
    ]);
  });

  it("is not looked at for a cow already in milk on the opening register, who has not just calved", async () => {
    const cow = await aCow("দোহন পেন", "milking");
    expect(await checksOver(cow.tag)).toEqual([]);
  });

  it("raises the Manager's work within the hour for a cow down", async () => {
    const cow = await aCow("বসা পেন", "dry");
    await sheCalves(cow);
    const manager = await as("manager", "2060-02-02T01:00:00.000Z");
    await manager.client.work.ensureDue();
    const animalId = await idOf(cow.tag);
    const [first] = await scratchDb().query.sopInstance.findMany({
      where: { animalId, definitionId: checkId },
      columns: { id: true },
      orderBy: { dueAt: "asc" },
    });
    await manager.client.work.claim({ id: first?.id ?? "" });
    await manager.client.work.completeStep({
      instanceId: first?.id ?? "",
      stepId: "look",
      animalTag: cow.tag,
      evidence: ["down_cow"],
    });
    const later = await as("manager", "2060-02-02T01:30:00.000Z");
    await later.client.work.ensureDue();
    const urgent = await scratchDb().query.sopInstance.findMany({
      where: { animalId, definitionId: urgentId },
      columns: { graceMinutes: true },
    });
    expect(urgent).toEqual([{ graceMinutes: 60 }]);
  });
});
