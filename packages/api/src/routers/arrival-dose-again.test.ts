import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * A bull's arrival dose skipped — "Unwell — to be given later", or anything else — or closed Missed is still owed: it is
 * raised again for him alone after the farm's days, until it is given. A Pen's Campaign dose skipped is not an arrival
 * dose, and is left as it is.
 */
const suffix = `dose-again-${Date.now()}`;
const ARRIVED = "2087-01-05T04:00:00.000Z";
/** His FMD falls ten days after he came. */
const DOSE_DAY = "2087-01-15T05:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;
const LATER = "অসুস্থ — পরে দেওয়া হবে";

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let fmdId = "";
let campaignId = "";
let penId = "";
const tags = {
  skipped: "",
  missed: "",
  corrected: "",
  campaign: "",
  retired: "",
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
  const campaign = await owner.client.sops.create({
    content: playbook.fmdVaccination,
  });
  campaignId = campaign.definitionId;
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.createShed({ name: suffix });
  const pen = await manager.client.sheds.createPen({
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
      targetWindowStart: "2087-06-01",
      targetWindowEnd: "2087-06-05",
    });
    tags[key] = bull.tagNumber;
  }
});

/** The FMD work about him, oldest first, once the day is turned at `at`. */
const hisFmd = async (at: string, tagNumber: string) => {
  const manager = await as("manager", at);
  await manager.client.work.ensureDue();
  const him = await manager.client.animals.get({ tagNumber });
  return await scratchDb().query.sopInstance.findMany({
    where: { definitionId: fmdId, animalId: him.id },
    columns: { id: true, state: true, dueAt: true, cause: true, penId: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
};

/** His dose walked: the vial's lot, then the dose given — or skipped. */
const dose = async (
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

const again = <Row extends { cause: string | null }>(rows: Row[]) =>
  rows.filter((one) => one.cause?.includes(":again:"));

describe("an arrival dose put off", () => {
  it("is raised again for him alone seven days on, and given then, is owed no more", async () => {
    const [work] = await hisFmd(DOSE_DAY, tags.skipped);
    await dose(DOSE_DAY, work?.id ?? "", tags.skipped, { skipped: true });
    const after = await hisFmd(DOSE_DAY, tags.skipped);
    const [raised] = again(after);
    expect(raised?.dueAt.getTime()).toBe(
      new Date(DOSE_DAY).getTime() + 7 * DAY_MS
    );
    expect(raised?.penId).toBe(penId);
    // Said on his page while it is owed: the FMD, and when it comes round.
    const manager = await as("manager", DOSE_DAY);
    const owed = await manager.client.animals.dosesOwed({
      tagNumber: tags.skipped,
    });
    expect(owed).toEqual([
      expect.objectContaining({
        definitionId: fmdId,
        nextDueAt: raised?.dueAt,
      }),
    ]);
    const day = new Date(raised?.dueAt ?? 0).toISOString();
    await dose(day, raised?.id ?? "", tags.skipped, { skipped: false });
    const later = await hisFmd(day, tags.skipped);
    expect(again(later)).toHaveLength(1);
    expect(again(later)[0]?.state).not.toBe("called_off");
    const given = await as("manager", day);
    expect(
      await given.client.animals.dosesOwed({ tagNumber: tags.skipped })
    ).toEqual([]);
  });

  it("is owed no more once the skip is put right to say it was given", async () => {
    const [work] = await hisFmd(DOSE_DAY, tags.corrected);
    await dose(DOSE_DAY, work?.id ?? "", tags.corrected, { skipped: true });
    expect(again(await hisFmd(DOSE_DAY, tags.corrected))).toHaveLength(1);
    const manager = await as("manager", "2087-01-15T09:00:00.000Z");
    const board = await manager.client.work.get({ id: work?.id ?? "" });
    const given = board.completions.find((row) => row.stepId === "dose");
    await correctStepAsShown(manager.client, {
      completionId: given?.id ?? "",
      evidence: [true, ""],
      reason: `টিকা আসলে দেওয়া হয়েছিল ${suffix}`,
    });
    const after = await hisFmd(DOSE_DAY, tags.corrected);
    expect(again(after).map((one) => one.state)).toEqual(["called_off"]);
  });

  it("is raised again when it is closed Missed", async () => {
    const [work] = await hisFmd(DOSE_DAY, tags.missed);
    const owner = await as("owner", "2087-01-17T05:00:00.000Z");
    await owner.client.work.closeAsMissed({
      id: work?.id ?? "",
      reason: `কেউ দেয়নি ${suffix}`,
    });
    expect(
      again(await hisFmd("2087-01-17T05:00:00.000Z", tags.missed))
    ).toHaveLength(1);
  });

  it("is not raised again for a Pen's Campaign dose skipped", async () => {
    const manager = await as("manager", DOSE_DAY);
    await manager.client.work.raiseNow({
      definitionId: campaignId,
      penId,
    });
    const listed = await manager.client.work.today({ penId });
    const campaign = listed.find((row) => row.definitionId === campaignId);
    await dose(DOSE_DAY, campaign?.id ?? "", tags.campaign, { skipped: true });
    const raised = await scratchDb().query.sopInstance.findMany({
      where: { definitionId: campaignId, cause: { like: "%:again:%" } },
      columns: { id: true },
    });
    expect(raised).toEqual([]);
  });

  it("is not raised again once the Owner retires the procedure", async () => {
    const owner = await as("owner", "2087-01-12T05:00:00.000Z");
    await owner.client.work.ensureDue();
    await owner.client.sops.retire({
      definitionId: fmdId,
      note: `ভেটের দিন আসেনি ${suffix}`,
    });
    expect(
      again(await hisFmd("2087-01-30T05:00:00.000Z", tags.retired))
    ).toEqual([]);
  });
});
