import { penAssignment } from "@OpenFarm/db/schema/herd";
import { STAYS_A_HEIFER, standardPlaybook } from "@OpenFarm/domain";
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

// Weaning from the Standard Playbook: raised at ninety days, with a weigh-in. A heifer calf becomes a Heifer on the
// Dairy side; a bull calf is walked across to the Fattening Pen the farm named, and his fattening starts there.

const suffix = `wean-${Date.now()}`;
const BORN = "2053-01-10T04:00:00.000Z";
/** Ninety days on, in the morning. */
const WEANING_DAY = "2053-04-10";

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let calfPenId = "";
let fatteningPenId = "";
let weaningId = "";
let heiferCalf = "";
let bullCalf = "";

beforeAll(async () => {
  const owner = await as("owner", BORN);
  const shed = await owner.client.herd.createShed({ name: suffix });
  const calves = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বাছুর ${suffix}`,
  });
  const fattening = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `এঁড়ে ${suffix}`,
  });
  calfPenId = calves.id;
  fatteningPenId = fattening.id;
  const sop = await owner.client.sops.create({
    content: standardPlaybook({ weanedBullPen: fattening.id }).weaning,
  });
  weaningId = sop.definitionId;
  await as("staff", BORN);
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-wean-${calves.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: calves.id,
    })
    .onConflictDoNothing();
  const calf = async (sex: "female" | "male") => {
    const registered = await owner.client.animals.register({
      sex,
      side: "dairy",
      state: "calf",
      penId: calves.id,
      source: "born",
      aliases: [],
      birthDate: new Date(BORN),
    });
    return registered.tagNumber;
  };
  heiferCalf = await calf("female");
  bullCalf = await calf("male");
});

/** An animal's id, for finding the work raised about her. */
const idOf = async (tag: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true },
  });
  return her?.id ?? "";
};

/** The weaning work in the calves' Pen on a day, claimed by the milker. */
const weaningWork = async (day: string) => {
  const instant = `${day}T02:00:00.000Z`;
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId: calfPenId });
  return today.filter((row) => row.definitionId === weaningId);
};

describe("weaning", () => {
  it("is not raised before ninety days", async () => {
    expect(await weaningWork("2053-04-08")).toHaveLength(0);
  });

  it("weighs each calf, makes a heifer calf a Heifer, and walks a bull calf to Fattening", async () => {
    const work = await weaningWork(WEANING_DAY);
    // One job for each calf, raised from the day she became one.
    expect(work).toHaveLength(2);
    const staff = await as("staff", `${WEANING_DAY}T03:00:00.000Z`);
    const wean = async (tag: string, where: string, kg: number) => {
      const calfId = await idOf(tag);
      const job = work.find((row) => row.animalId === calfId);
      const id = job?.id ?? "";
      await staff.client.instances.claim({ id });
      await staff.client.instances.completeStep({
        instanceId: id,
        stepId: "starter",
        animalTag: tag,
        evidence: [true],
      });
      await staff.client.instances.completeStep({
        instanceId: id,
        stepId: "weigh",
        animalTag: tag,
        evidence: [kg],
      });
      await staff.client.instances.completeStep({
        instanceId: id,
        stepId: "wean",
        animalTag: tag,
        evidence: [where],
      });
    };
    await wean(heiferCalf, STAYS_A_HEIFER, 62);
    await wean(bullCalf, fatteningPenId, 68);

    const manager = await as("manager", `${WEANING_DAY}T04:00:00.000Z`);
    const her = await manager.client.animals.byTag({ tagNumber: heiferCalf });
    expect(her).toMatchObject({ state: "heifer", side: "dairy" });
    const him = await manager.client.animals.byTag({ tagNumber: bullCalf });
    expect(him).toMatchObject({ state: "fattening", side: "fattening" });
    expect(him.pen?.id).toBe(fatteningPenId);

    const db = scratchDb();
    const weaned = await db.query.weaning.findMany({
      where: { farmId: theFarm().id },
      columns: { weightKg: true, to: true },
      with: { animal: { columns: { tagNumber: true } } },
    });
    expect(
      weaned
        .filter((one) => [heiferCalf, bullCalf].includes(one.animal.tagNumber))
        .map((one) => [one.animal.tagNumber, Number(one.weightKg), one.to])
        .toSorted()
    ).toEqual(
      [
        [heiferCalf, 62, "dairy"],
        [bullCalf, 68, "fattening"],
      ].toSorted()
    );
  });

  it("cannot be taken back from here: corrected to a skip, she stays a Heifer and the Manager is asked", async () => {
    const herId = await idOf(heiferCalf);
    const done = await scratchDb().query.stepCompletion.findFirst({
      where: { animalId: herId, stepId: "wean" },
      columns: { id: true },
    });
    const manager = await as("manager", `${WEANING_DAY}T05:00:00.000Z`);
    const undone = await correctStepAsShown(manager.client, {
      completionId: done?.id ?? "",
      skipReason: "এখনো নয় — দিনে ১ কেজি দানাদার খাচ্ছে না",
      reason: "ভুল বাছুর লেখা হয়েছিল",
    });
    expect(undone.needsReview).toBe(true);
    const her = await manager.client.animals.byTag({ tagNumber: heiferCalf });
    expect(her.state).toBe("heifer");
  });

  it("puts the bull calf on the Fattening board, his days counted from his weaning", async () => {
    const manager = await as("manager", "2053-04-20T04:00:00.000Z");
    const him = await manager.client.animals.byTag({ tagNumber: bullCalf });
    expect(him.fattening?.daysOnFeed).toBe(10);
  });

  it("refuses to keep a bull calf as a heifer", async () => {
    const owner = await as("owner", "2053-04-11T04:00:00.000Z");
    const late = await owner.client.animals.register({
      sex: "male",
      side: "dairy",
      state: "calf",
      penId: calfPenId,
      source: "born",
      aliases: [],
    });
    const later = "2053-07-10";
    const work = await weaningWork(later);
    const lateId = await idOf(late.tagNumber);
    const job = work.find((row) => row.animalId === lateId);
    const staff = await as("staff", `${later}T03:00:00.000Z`);
    await staff.client.instances.claim({ id: job?.id ?? "" });
    await expect(
      staff.client.instances.completeStep({
        instanceId: job?.id ?? "",
        stepId: "wean",
        animalTag: late.tagNumber,
        evidence: [STAYS_A_HEIFER],
      })
    ).rejects.toMatchObject({ data: { refusal: "a_bull_calf_is_no_heifer" } });
  });
});
