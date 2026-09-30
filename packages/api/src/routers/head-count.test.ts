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

// The evening Head Count: each Pen counted blind at lock-up and set against the animals the register puts there at that
// moment; a Pen that does not count right is told to the Manager, who walks it and counts again, and marks the animal
// not found.

const suffix = `head-count-${Date.now()}`;

let countId = "";

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** Lock-up on a farm day: 19:30 at the farm, UTC+6. */
const lockUp = (day: string) => `${day}T13:30:00.000Z`;

beforeAll(async () => {
  const owner = await as("owner", "2055-01-01T00:00:00.000Z");
  const made = await owner.client.sops.create({
    content: standardPlaybook().headCount,
  });
  countId = made.definitionId;
});

/** A Pen of its own, with this many heifers in it, for each question. */
const aPenOf = async (name: string, head: number) => {
  const owner = await as("owner", "2055-01-01T00:00:00.000Z");
  const shed = await owner.client.herd.createShed({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.herd.createPen({ shedId: shed.id, name });
  const tags: string[] = [];
  for (let one = 0; one < head; one += 1) {
    // One after another, as the register is written.
    // oxlint-disable-next-line no-await-in-loop
    const her = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    tags.push(her.tagNumber);
  }
  return { penId: pen.id, name, tags };
};

/** The evening's count for a Pen, written by the Manager on the Pen's phone. */
const countIn = async (day: string, penId: string, counted: number) => {
  const manager = await as("manager", lockUp(day));
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  const work = today.find((row) => row.definitionId === countId);
  if (!work) {
    throw new Error("expected the evening head count");
  }
  await manager.client.instances.claim({ id: work.id });
  const done = await manager.client.instances.completeStep({
    instanceId: work.id,
    stepId: "count",
    evidence: [counted],
  });
  return { manager, workId: work.id, done };
};

const toldTo = async (role: "owner" | "manager", workId: string) =>
  await scratchDb().query.alert.findMany({
    where: {
      kind: "head_count_differs",
      userId: thePerson(role).id,
      entityId: workId,
    },
    columns: { params: true },
  });

const sweepAt = async (instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.alerts.sweep();
  await manager.client.alerts.sweep();
};

describe("the evening head count", () => {
  it("is blind: the one counting is told whether it matched, never how many to find", async () => {
    const pen = await aPenOf("গণনা পেন ক", 3);
    const { done, workId } = await countIn("2055-01-10", pen.penId, 3);
    expect(done.effect).toEqual({ kind: "head_count", differs: false });
    await sweepAt("2055-01-10T14:00:00.000Z");
    expect(await toldTo("manager", workId)).toEqual([]);
  });

  it("tells the Manager once of a Pen one short, and not the Owner", async () => {
    const pen = await aPenOf("গণনা পেন খ", 3);
    const { done, workId } = await countIn("2055-01-11", pen.penId, 2);
    expect(done.effect).toEqual({ kind: "head_count", differs: true });
    await sweepAt("2055-01-11T14:00:00.000Z");
    const told = await toldTo("manager", workId);
    expect(told).toHaveLength(1);
    expect(told[0]?.params).toMatchObject({
      pen: "গণনা পেন খ",
      counted: 2,
      expected: 3,
    });
    expect(await toldTo("owner", workId)).toEqual([]);
  });

  it("tells of one over, as a calf nobody wrote down", async () => {
    const pen = await aPenOf("গণনা পেন গ", 2);
    const { workId } = await countIn("2055-01-12", pen.penId, 3);
    await sweepAt("2055-01-12T14:00:00.000Z");
    expect(await toldTo("manager", workId)).toHaveLength(1);
  });

  it("counts an animal walked across before lock-up in the Pen she was walked to", async () => {
    const from = await aPenOf("গণনা পেন ঘ", 2);
    const to = await aPenOf("গণনা পেন ঙ", 2);
    const owner = await as("owner", "2055-01-13T10:00:00.000Z");
    await owner.client.animals.move({
      tagNumber: from.tags[0] ?? "",
      toPenId: to.penId,
    });
    const left = await countIn("2055-01-13", from.penId, 1);
    const came = await countIn("2055-01-13", to.penId, 3);
    expect(left.done.effect).toMatchObject({ differs: false });
    expect(came.done.effect).toMatchObject({ differs: false });
  });

  it("compares again when the Manager counts again", async () => {
    const pen = await aPenOf("গণনা পেন চ", 3);
    const { manager, workId } = await countIn("2055-01-14", pen.penId, 2);
    const done = await scratchDb().query.stepCompletion.findFirst({
      where: { instanceId: workId, stepId: "count" },
      columns: { id: true },
    });
    const completionId = done?.id ?? "";
    await correctStepAsShown(manager.client, {
      completionId,
      reason: "আবার গুনে তিনটিই পাওয়া গেছে",
      evidence: [3],
    });
    const row = await scratchDb().query.headCount.findFirst({
      where: { completionId },
      columns: { counted: true, expected: true },
    });
    expect(row).toEqual({ counted: 3, expected: 3 });
  });

  it("opens nothing by itself: the Manager marks which animal is not found", async () => {
    const pen = await aPenOf("গণনা পেন ছ", 2);
    const { workId } = await countIn("2055-01-15", pen.penId, 1);
    const [gone] = pen.tags;
    const her = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: gone ?? "" },
      columns: { id: true },
    });
    const open = () =>
      scratchDb().query.missing.findMany({
        where: { animalId: her?.id ?? "", foundAt: { isNull: true } },
        columns: { id: true, completionId: true },
      });
    await sweepAt("2055-01-15T14:00:00.000Z");
    expect(await toldTo("manager", workId)).toHaveLength(1);
    expect(await open()).toEqual([]);

    const manager = await as("manager", "2055-01-15T15:00:00.000Z");
    await manager.client.animals.notFound({ tagNumber: gone ?? "" });
    await manager.client.animals.notFound({ tagNumber: gone ?? "" });
    const opened = await open();
    expect(opened).toHaveLength(1);
    expect(opened[0]?.completionId).toBeNull();
  });
});
