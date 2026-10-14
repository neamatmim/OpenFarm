import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Campaign's dose put off for a bull is held while he is Ready for Sale: given then, its withdrawal could hold up the
 * sale he is ready for. Gone back to Fattening unsold, he owes it again from that day.
 */
const suffix = `dose-held-${Date.now()}`;
const ARRIVED = "2087-03-01T04:00:00.000Z";
const DOSE_DAY = "2087-03-10T05:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;
const LATER = "অসুস্থ — পরে দেওয়া হবে";

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let campaignId = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner", ARRIVED);
  const vet = await as("vet", ARRIVED);
  const vaccine = await vet.client.drugs.create({
    name: { bn: `এফএমডি টিকা ${suffix}`, en: "FMD vaccine" },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 21,
  });
  const campaign = await owner.client.sops.create({
    content: standardPlaybook({ fmdVaccine: vaccine.id }).fmdVaccination,
  });
  campaignId = campaign.definitionId;
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.create({ name: suffix });
  const pen = await manager.client.sheds.pens.create({
    shedId: shed.id,
    name: `কোয়ারেন্টিন ${suffix}`,
    quarantine: true,
  });
  penId = pen.id;
});

/** A bull off the lorry into Quarantine, and let out to Fattening the same day. */
const aBull = async () => {
  const manager = await as("manager", ARRIVED);
  const bull = await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 300,
    estimatedAgeMonths: 24,
    arrivedAt: new Date(ARRIVED),
    targetWindowStart: "2087-04-01",
    targetWindowEnd: "2087-04-05",
  });
  await manager.client.animals.setState({
    tagNumber: bull.tagNumber,
    state: "fattening",
  });
  const him = await manager.client.animals.get({ tagNumber: bull.tagNumber });
  expect(him.state).toBe("fattening");
  return bull.tagNumber;
};

/** The Pen's Campaign walked on `at`, his dose skipped "unwell — later". */
const skippedOnTheCampaign = async (at: string, tagNumber: string) => {
  const manager = await as("manager", at);
  await manager.client.work.raiseNow({ definitionId: campaignId, penId });
  const listed = await manager.client.work.today({ penId });
  const workId =
    listed.find((row) => row.definitionId === campaignId && !row.animalId)
      ?.id ?? "";
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
    evidence: [],
    skipReason: LATER,
  });
};

/** His dose of the Campaign raised again, oldest first. */
const hisAgain = async (tagNumber: string) => {
  const manager = await as("manager", DOSE_DAY);
  const him = await manager.client.animals.get({ tagNumber });
  return await scratchDb().query.sopInstance.findMany({
    where: {
      definitionId: campaignId,
      animalId: him.id,
      cause: { like: "%:again:%" },
    },
    columns: {
      id: true,
      state: true,
      dueAt: true,
      cause: true,
      calledOffBy: true,
    },
    orderBy: { dueAt: "asc", id: "asc" },
  });
};

describe("a Campaign dose put off for a bull Ready for Sale", () => {
  it("is held when he is confirmed ready, and owed again from the day he goes back to Fattening", async () => {
    const tag = await aBull();
    await skippedOnTheCampaign(DOSE_DAY, tag);
    const owed = await hisAgain(tag);
    expect(owed.map((one) => one.state)).toEqual(["due"]);

    const confirmedOn = "2087-03-12T05:00:00.000Z";
    const manager = await as("manager", confirmedOn);
    await manager.client.readyForSale.confirm({ tagNumber: tag });
    expect(await hisAgain(tag)).toEqual([
      expect.objectContaining({
        state: "called_off",
        calledOffBy: "held_for_sale",
      }),
    ]);

    const backOn = "2087-04-10T05:00:00.000Z";
    const unsold = await as("manager", backOn);
    await unsold.client.animals.setState({
      tagNumber: tag,
      state: "fattening",
    });
    const after = await hisAgain(tag);
    expect(after.map((one) => one.state)).toEqual(["called_off", "due"]);
    expect(after[1]?.dueAt.getTime()).toBe(new Date(backOn).getTime());
  });

  it("is held, not raised, when it comes round while he is ready", async () => {
    const tag = await aBull();
    const manager = await as("manager", "2087-03-09T05:00:00.000Z");
    await manager.client.readyForSale.confirm({ tagNumber: tag });
    // Walked over the Pen the next day, his dose put off: nothing he owes until he is fattening again.
    await skippedOnTheCampaign(DOSE_DAY, tag);
    expect(await hisAgain(tag)).toEqual([
      expect.objectContaining({
        state: "called_off",
        calledOffBy: "held_for_sale",
      }),
    ]);
    const later = new Date(new Date(DOSE_DAY).getTime() + 30 * DAY_MS);
    const owner = await as("owner", later.toISOString());
    await owner.client.work.ensureDue();
    const still = await hisAgain(tag);
    expect(still.map((one) => one.state)).toEqual(["called_off"]);
  });
});
