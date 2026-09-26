import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Venture Plan: what the Owner means to buy, in lines by weight band, and what a kilo will sell at. Every save is a
// version; the last one saved while the Venture was Open is its baseline, and one saved after buying began is a
// revision that says why. The Owner's alone.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2053-01-01T04:00:00.000Z";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

/** Eight bulls of 200 to 250 kg at ৳480 a kilo and four of 250 to 300 at ৳470: 12 animals, ৳13,81,000. */
const FIRST = {
  animals: 8,
  fromKg: 200,
  toKg: 250,
  buyBdtPerKg: 480,
  dailyGainKg: 0.9,
};
const LINES = [
  FIRST,
  { animals: 4, fromKg: 250, toKg: 300, buyBdtPerKg: 470, dailyGainKg: 0.8 },
];
const SALE = { saleLowBdtPerKg: 520, saleHighBdtPerKg: 600 };

let ventureId = "";

beforeAll(async () => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `পরিকল্পনার ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_800_000,
    floorBdt: 0,
    // Bought from the 20th, sold from 30 April: a hundred days on feed.
    decideBy: "2053-01-20",
    targetWindowStart: "2053-04-30",
    targetWindowEnd: "2053-05-05",
    unitPriceBdt: 50_000,
    units: 36,
    cattleBudgetBdt: 1_400_000,
  });
  ventureId = venture.id;
});

describe("a Venture Plan", () => {
  it("is the Owner's alone to set", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(JANUARY),
    });
    await expect(
      manager.ventures.setPlan({ ventureId, lines: LINES, ...SALE })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a band whose lower weight is not below its upper, and a plan with no lines", async () => {
    const owner = await asOwner();
    await expect(
      owner.ventures.setPlan({
        ventureId,
        lines: [{ ...FIRST, fromKg: 250, toKg: 250 }],
        ...SALE,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.ventures.setPlan({ ventureId, lines: [], ...SALE })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps each save as a version, measures by the last made while Open, and says what it comes to", async () => {
    const owner = await asOwner();
    await owner.ventures.setPlan({
      ventureId,
      lines: [FIRST],
      ...SALE,
    });
    await owner.ventures.setPlan({ ventureId, lines: LINES, ...SALE });

    const plan = await owner.ventures.plan({ ventureId });
    expect(plan.versions.map((one) => [one.version, one.madeWhile])).toEqual([
      [1, "open"],
      [2, "open"],
    ]);
    expect(plan.baseline?.version).toBe(2);
    expect(plan.latest?.version).toBe(2);
    expect(plan.latest?.lines).toEqual(LINES);
    // 1,800 kg at ৳480 and 1,100 kg at ৳470 is ৳13,81,000 for 12 animals; a hundred days on, 315 kg and 355 kg a head.
    expect(plan.latest?.totals).toMatchObject({
      animals: 12,
      boughtKg: 2900,
      costBdt: 1_381_000,
      saleKg: 3940,
      overBudgetBdt: 0,
    });
  });

  it("asks why once buying has begun, and keeps the baseline where it was", async () => {
    const owner = await asOwner();
    const him = await owner.investors.record({
      name: `বিনিয়োগকারী ${suffix}`,
      phone: `0189${suffix}`,
    });
    const signed = await owner.ventures.sign({
      ventureId,
      investorId: him.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampValueBdt: 300,
      stampedOn: "2053-01-02",
      stampSerial: `PL-${suffix}`,
    });
    await owner.ventures.keepAgreementPaper({
      agreementId: signed.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.ventures.takeCapital({
      agreementId: signed.id,
      amountBdt: 100_000,
      movedOn: "2053-01-03",
      paymentMethod: "bank",
      reference: `TRF-PL-${suffix}`,
    });
    await owner.ventures.startBuying({ id: ventureId });

    const buying = await asOwner();
    await expect(
      buying.ventures.setPlan({ ventureId, lines: LINES, ...SALE })
    ).rejects.toMatchObject({
      data: { refusal: "plan_revision_needs_reason" },
    });

    await buying.ventures.setPlan({
      ventureId,
      lines: LINES,
      saleLowBdtPerKg: 540,
      saleHighBdtPerKg: 620,
      reason: "হাটে দাম বেড়েছে",
    });
    const plan = await buying.ventures.plan({ ventureId });
    expect(plan.latest).toMatchObject({
      version: 3,
      madeWhile: "buying",
      reason: "হাটে দাম বেড়েছে",
      saleLowBdtPerKg: 540,
    });
    // What it promised itself before a taka went on cattle is still what it is measured against.
    expect(plan.baseline).toMatchObject({ version: 2, saleLowBdtPerKg: 520 });
  });
});
