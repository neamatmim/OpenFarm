import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// "Which of what the round saw is still open?" used to mean opening each Observation's work. The list now says what
// became of each: the work it raised still owed, done and what was done, or what the Vet made of her.

const suffix = `observation-outcome-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let roundId = "";
let unwellId = "";

beforeAll(async () => {
  const owner = await as("owner", "2076-05-01T00:00:00.000Z");
  const playbook = standardPlaybook();
  const [round, unwell] = await Promise.all([
    owner.client.sops.create({ content: playbook.healthRound }),
    owner.client.sops.create({ content: playbook.seeToUnwell }),
  ]);
  roundId = round.definitionId;
  unwellId = unwell.definitionId;
});

const aCow = async (name: string) => {
  const owner = await as("owner", "2076-05-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: `${suffix}-${name}` });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
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

/** The round sees her lame, and the day raises the Manager's work about her. */
const seenLame = async (cow: { penId: string; tag: string }) => {
  const manager = await as("manager", "2076-05-02T03:00:00.000Z");
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId: cow.penId });
  const id = today.find((row) => row.definitionId === roundId)?.id ?? "";
  await manager.client.work.claim({ id });
  await manager.client.work.completeStep({
    instanceId: id,
    stepId: "look",
    animalTag: cow.tag,
    evidence: ["lame"],
  });
  const later = await as("manager", "2076-05-02T04:00:00.000Z");
  await later.client.work.ensureDue();
  return later;
};

const rowOf = async (manager: Awaited<ReturnType<typeof as>>, tag: string) => {
  const rows = await manager.client.observations.list({});
  return rows.find((row) => row.tagNumber === tag);
};

describe("what became of a sighting", () => {
  it("says the work it raised is still owed", async () => {
    const cow = await aCow("open");
    const manager = await seenLame(cow);

    const row = await rowOf(manager, cow.tag);

    expect(row?.outcome).toMatchObject({ state: "open", said: null });
  });

  it("says it was answered, and what was done", async () => {
    const cow = await aCow("answered");
    const manager = await seenLame(cow);
    const today = await manager.client.work.today({ penId: cow.penId });
    const work = today.find((one) => one.definitionId === unwellId);
    await manager.client.work.claim({ id: work?.id ?? "" });
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "answer",
      animalTag: cow.tag,
      evidence: ["vet_called"],
    });
    await manager.client.work.complete({ id: work?.id ?? "" });

    const row = await rowOf(manager, cow.tag);

    expect(row?.outcome).toMatchObject({
      state: "done",
      said: { en: "The Vet has been called" },
    });
  });

  it("says what the Vet made of her, when a Diagnosis answered it and called its work off", async () => {
    const cow = await aCow("diagnosed");
    const manager = await seenLame(cow);
    const seen = await rowOf(manager, cow.tag);
    const vet = await as("vet", "2076-05-02T05:00:00.000Z");
    await vet.client.diagnoses.record({
      animalTag: cow.tag,
      answers: seen?.id ?? "",
      disease: { bn: `খুরা রোগ ${suffix}`, en: "Foot rot" },
    });

    const row = await rowOf(manager, cow.tag);

    expect(row?.outcome).toMatchObject({
      state: "diagnosed",
      diagnosis: { bn: `খুরা রোগ ${suffix}`, en: "Foot rot" },
    });
  });

  it("says what the Vet made of her when she was diagnosed before any work was raised", async () => {
    const cow = await aCow("diagnosed-first");
    const manager = await as("manager", "2076-05-02T03:00:00.000Z");
    await manager.client.observations.record({
      tagNumber: cow.tag,
      saw: "cough",
    });
    const seen = await rowOf(manager, cow.tag);
    const vet = await as("vet", "2076-05-02T03:30:00.000Z");
    await vet.client.diagnoses.record({
      animalTag: cow.tag,
      answers: seen?.id ?? "",
      disease: { bn: `নিউমোনিয়া ${suffix}` },
    });

    const row = await rowOf(manager, cow.tag);

    expect(row?.outcome).toMatchObject({
      state: "diagnosed",
      instanceId: null,
      diagnosis: { bn: `নিউমোনিয়া ${suffix}` },
    });
  });

  it("says nothing of a sighting that raised no work", async () => {
    const cow = await aCow("nothing");
    const manager = await as("manager", "2076-05-02T03:00:00.000Z");
    await manager.client.observations.record({
      tagNumber: cow.tag,
      saw: "heat",
    });

    const row = await rowOf(manager, cow.tag);

    expect(row?.outcome ?? null).toBeNull();
  });
});
