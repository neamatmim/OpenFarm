import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A bull is not let out of Quarantine — by the Release Step or by hand — while an arrival dose is still owed him,
 * unless the Vet has written why it is not needed. With no dose procedure adopted, nothing is owed.
 */
const suffix = `owes-doses-${Date.now()}`;
const ARRIVED = "2088-01-05T04:00:00.000Z";
/** His FMD falls ten days after he came. */
const DOSE_DAY = "2088-01-15T05:00:00.000Z";
/** A day past his thirty days in Quarantine. */
const RELEASE_DAY = "2088-02-05T05:00:00.000Z";
const LATER = "অসুস্থ — পরে দেওয়া হবে";

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let fmdId = "";
let releaseId = "";
let penId = "";
const tags = {
  owes: "",
  given: "",
  excused: "",
  byHand: "",
  early: "",
  takenBack: "",
};

/** The work one procedure raised about him, oldest first. */
const workOf = async (definitionId: string, tagNumber: string) => {
  const manager = await as("manager", DOSE_DAY);
  const him = await manager.client.animals.get({ tagNumber });
  return await scratchDb().query.sopInstance.findMany({
    where: { definitionId, animalId: him.id },
    columns: { id: true, state: true, dueAt: true, cause: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
};

/** His dose walked: the vial's lot, then the dose given — or skipped. */
const doseHim = async (
  at: string,
  workId: string,
  tagNumber: string,
  { skipped }: { skipped: boolean }
) => {
  const manager = await as("manager", at);
  await manager.client.work.claim({ id: workId });
  await manager.client.work.completeStep({
    instanceId: workId,
    stepId: "lot",
    evidence: [`FMD-${suffix}`],
  });
  await manager.client.work.completeStep({
    instanceId: workId,
    stepId: "dose",
    animalTag: tagNumber,
    evidence: skipped ? [] : [true, ""],
    ...(skipped ? { skipReason: LATER } : {}),
  });
};

beforeAll(async () => {
  const owner = await as("owner", ARRIVED);
  const vet = await as("vet", ARRIVED);
  const vaccine = await vet.client.drugs.create({
    name: { bn: `এফএমডি টিকা ${suffix}`, en: "FMD vaccine" },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  const playbook = standardPlaybook({ fmdVaccine: vaccine.id });
  const fmd = await owner.client.sops.create({ content: playbook.arrivalFmd });
  fmdId = fmd.definitionId;
  const release = await owner.client.sops.create({
    content: playbook.quarantineRelease,
  });
  releaseId = release.definitionId;
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.create({ name: suffix });
  const pen = await manager.client.sheds.pens.create({
    shedId: shed.id,
    name: `কোয়ারেন্টিন ${suffix}`,
    quarantine: true,
  });
  penId = pen.id;
  for (const key of Object.keys(tags) as (keyof typeof tags)[]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
    const bull = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg: 200,
      estimatedAgeMonths: 18,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2088-06-01",
      targetWindowEnd: "2088-06-05",
    });
    tags[key] = bull.tagNumber;
  }
  // His FMD, skipped for every bull but the early one, whose day the test never turns to.
  const day = await as("manager", DOSE_DAY);
  await day.client.work.ensureDue();
  for (const key of [
    "owes",
    "given",
    "excused",
    "byHand",
    "takenBack",
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one bull at a time
    const [work] = await workOf(fmdId, tags[key]);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await doseHim(DOSE_DAY, work?.id ?? "", tags[key], { skipped: true });
  }
});
/** His Release walked, every step done: well, every dose given, let out. */
const releaseHim = async (tagNumber: string, at = RELEASE_DAY) => {
  const manager = await as("manager", at);
  await manager.client.work.ensureDue();
  const [work] = await workOf(releaseId, tagNumber);
  await manager.client.work.claim({ id: work?.id ?? "" });
  for (const stepId of ["healthy", "doses", "release"]) {
    // oxlint-disable-next-line no-await-in-loop -- the steps are walked in their order
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId,
      animalTag: tagNumber,
      evidence: [true],
    });
  }
  return await manager.client.animals.get({ tagNumber });
};

describe("a Release while an arrival dose is owed", () => {
  it("is refused by its Step, naming the dose", async () => {
    await expect(releaseHim(tags.owes)).rejects.toMatchObject({
      data: { refusal: "arrival_dose_owed" },
    });
  });

  it("is refused by hand the same", async () => {
    const owner = await as("owner", RELEASE_DAY);
    await expect(
      owner.client.animals.setState({
        tagNumber: tags.byHand,
        state: "fattening",
        reason: `ছেড়ে দিন ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "arrival_dose_owed" } });
  });

  it("goes ahead once the dose is given on the work raised again", async () => {
    const work = await workOf(fmdId, tags.given);
    const again = work.find((one) => one.cause?.includes(":again:"));
    const day = new Date(again?.dueAt ?? 0).toISOString();
    await doseHim(day, again?.id ?? "", tags.given, { skipped: false });
    const him = await releaseHim(tags.given);
    expect(him.state).toBe("fattening");
  });

  it("goes ahead once the Vet writes why the dose is not needed, and calls off what was raised again", async () => {
    const manager = await as("manager", RELEASE_DAY);
    const excuse = {
      tagNumber: tags.excused,
      definitionId: fmdId,
      reason: `আগের খামারে টিকা দেওয়া, কার্ড দেখেছি ${suffix}`,
    };
    await expect(
      manager.client.treatments.excuseArrivalDose(excuse)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const vet = await as("vet", RELEASE_DAY);
    await vet.client.treatments.excuseArrivalDose(excuse);
    const work = await workOf(fmdId, tags.excused);
    expect(
      work
        .filter((one) => one.cause?.includes(":again:"))
        .map((one) => one.state)
    ).toEqual(["called_off"]);
    const him = await releaseHim(tags.excused);
    expect(him.state).toBe("fattening");
    // Excused once, it is not owed: excusing it again is refused.
    await expect(
      vet.client.treatments.excuseArrivalDose(excuse)
    ).rejects.toMatchObject({ data: { refusal: "dose_not_owed" } });
  });

  it("is not held by a dose not yet due", async () => {
    // Released by hand before his FMD's day: nothing is owed yet.
    const owner = await as("owner", "2088-01-10T05:00:00.000Z");
    await owner.client.animals.setState({
      tagNumber: tags.early,
      state: "fattening",
      reason: `ভেট দেখে ছেড়েছেন ${suffix}`,
    });
    const him = await owner.client.animals.get({ tagNumber: tags.early });
    expect(him.state).toBe("fattening");
  });

  it("holds him again when the Vet takes the excuse back, the dose raised again — never once he is released on it", async () => {
    const vet = await as("vet", RELEASE_DAY);
    const excuse = {
      tagNumber: tags.takenBack,
      definitionId: fmdId,
      reason: `কার্ড দেখেছি ${suffix}`,
    };
    await vet.client.treatments.excuseArrivalDose(excuse);
    await vet.client.treatments.takeBackExcuse({
      ...excuse,
      reason: `কার্ডটি অন্য ষাঁড়ের ছিল ${suffix}`,
    });

    await expect(releaseHim(tags.takenBack)).rejects.toMatchObject({
      data: { refusal: "arrival_dose_owed" },
    });
    const work = await workOf(fmdId, tags.takenBack);
    expect(
      work.some(
        (one) => one.cause?.includes(":again:") && one.state !== "called_off"
      )
    ).toBe(true);
    // The bull released on his excuse keeps it: his doses are now given in the herd.
    await expect(
      vet.client.treatments.takeBackExcuse({
        tagNumber: tags.excused,
        definitionId: fmdId,
        reason: `ভুল ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "released_on_it" } });
  });
});
