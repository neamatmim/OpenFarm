import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { aMonthOn } from "../test/carrying";
import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// A cow skipped at milking as unwell is an Observation of her, and so the Manager's work to see to her, as anything the
// round sees is. Her liters, written in its place, take it back.

const suffix = `milk-unwell-${Date.now()}`;
const UNWELL = "অসুস্থ";
const KICKING = "লাথি মারছে, দোহন করা যায়নি";

let milkingId = "";
let seeToId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2059-01-01T00:00:00.000Z");
  const playbook = standardPlaybook();
  const [milking, seeTo] = await Promise.all([
    owner.client.sops.create({ content: playbook.morningMilking }),
    owner.client.sops.create({ content: playbook.seeToUnwell }),
  ]);
  milkingId = milking.definitionId;
  seeToId = seeTo.definitionId;
});

/** A cow in milk, in a Pen of her own. */
const aCowInMilk = async (name: string) => {
  const owner = await as("owner", "2059-01-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  for (const state of ["pregnant_heifer", "milking"] as const) {
    // One State after the other, as she lives them.
    // oxlint-disable-next-line no-await-in-loop
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state,
      ...(state === "pregnant_heifer"
        ? { expectedCalvingOn: aMonthOn(owner) }
        : {}),
    });
  }
  return { penId: pen.id, tag: cow.tagNumber };
};

/** The morning milking in her Pen, her own Step answered as given. */
const milkHer = async (
  day: string,
  cow: { penId: string; tag: string },
  answer: { evidence: number[] } | { skipReason: string }
) => {
  const manager = await as("manager", `${day}T00:00:00.000Z`);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId: cow.penId });
  const work = today.find((row) => row.definitionId === milkingId);
  const id = work?.id ?? "";
  await manager.client.work.claim({ id });
  await manager.client.work.completeStep({
    instanceId: id,
    stepId: "milk",
    animalTag: cow.tag,
    evidence: [],
    ...answer,
  });
  const done = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId: id, stepId: "milk" },
    columns: { id: true },
  });
  return { manager, completionId: done?.id ?? "" };
};

const seenOf = async (tag: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true },
  });
  return scratchDb().query.observation.findMany({
    where: { animalId: her?.id ?? "" },
    columns: { saw: true, sawLabel: true, withdrawnAt: true },
  });
};

const workFor = async (instant: string, tag: string) => {
  const manager = await as("manager", instant);
  await manager.client.work.ensureDue();
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true },
  });
  return scratchDb().query.sopInstance.findMany({
    where: { animalId: her?.id ?? "", definitionId: seeToId },
    columns: { state: true },
  });
};

describe("a cow skipped at milking as unwell", () => {
  it("is an Observation of her, and the Manager's work to see to her", async () => {
    const cow = await aCowInMilk("অসুস্থ পেন");
    await milkHer("2059-01-02", cow, { skipReason: UNWELL });
    expect(await seenOf(cow.tag)).toMatchObject([
      { saw: "unwell", sawLabel: "দোহনের সময় অসুস্থ", withdrawnAt: null },
    ]);
    expect(await workFor("2059-01-02T01:00:00.000Z", cow.tag)).toMatchObject([
      { state: "due" },
    ]);
  });

  it("is seen once, however often the phone sends it", async () => {
    const cow = await aCowInMilk("আবার পেন");
    const { manager } = await milkHer("2059-01-03", cow, {
      skipReason: UNWELL,
    });
    const today = await manager.client.work.today({ penId: cow.penId });
    const work = today.find((row) => row.definitionId === milkingId);
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "milk",
      animalTag: cow.tag,
      evidence: [],
      skipReason: UNWELL,
    });
    expect(await seenOf(cow.tag)).toHaveLength(1);
  });

  it("is taken back, with her work, when her liters are written in its place", async () => {
    const cow = await aCowInMilk("ভুল পেন");
    const { manager, completionId } = await milkHer("2059-01-04", cow, {
      skipReason: UNWELL,
    });
    expect(await workFor("2059-01-04T01:00:00.000Z", cow.tag)).toHaveLength(1);
    await correctStepAsShown(manager.client, {
      completionId,
      reason: "অন্য গাভী ভেবেছিলাম",
      evidence: [8],
    });
    const [seen] = await seenOf(cow.tag);
    expect(seen?.withdrawnAt).not.toBeNull();
    expect(await workFor("2059-01-04T02:00:00.000Z", cow.tag)).toMatchObject([
      { state: "called_off" },
    ]);
  });
});

describe("a cow not milked for any other reason", () => {
  it("is no Observation", async () => {
    const cow = await aCowInMilk("লাথি পেন");
    await milkHer("2059-01-05", cow, { skipReason: KICKING });
    expect(await seenOf(cow.tag)).toHaveLength(0);
    expect(await workFor("2059-01-05T01:00:00.000Z", cow.tag)).toHaveLength(0);
  });
});
