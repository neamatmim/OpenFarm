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
  buyMoneyPerKg: 480,
  dailyGainKg: 0.9,
};
const LINES = [
  FIRST,
  { animals: 4, fromKg: 250, toKg: 300, buyMoneyPerKg: 470, dailyGainKg: 0.8 },
];
const SALE = { saleLowMoneyPerKg: 520, saleHighMoneyPerKg: 600 };

let ventureId = "";

beforeAll(async () => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `পরিকল্পনার ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_800_000,
    floorMoney: 0,
    // Bought from the 20th, sold from 30 April: a hundred days on feed.
    decideBy: "2053-01-20",
    targetWindowStart: "2053-04-30",
    targetWindowEnd: "2053-05-05",
    unitPriceMoney: 50_000,
    units: 36,
    cattleBudgetMoney: 1_400_000,
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
    // A line that names no Breed buys any.
    expect(plan.latest?.lines).toEqual(
      LINES.map((line) => ({ ...line, breedId: null }))
    );
    // 1,800 kg at ৳480 and 1,100 kg at ৳470 is ৳13,81,000 for 12 animals; a hundred days on, 315 kg and 355 kg a head.
    expect(plan.latest?.totals).toMatchObject({
      animals: 12,
      boughtKg: 2900,
      costMoney: 1_381_000,
      saleKg: 3940,
      overBudgetMoney: 0,
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
      stampValueMoney: 300,
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
      amountMoney: 100_000,
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
      saleLowMoneyPerKg: 540,
      saleHighMoneyPerKg: 620,
      reason: "হাটে দাম বেড়েছে",
    });
    const plan = await buying.ventures.plan({ ventureId });
    expect(plan.latest).toMatchObject({
      version: 3,
      madeWhile: "buying",
      reason: "হাটে দাম বেড়েছে",
      saleLowMoneyPerKg: 540,
    });
    // What it promised itself before a taka went on cattle is still what it is measured against.
    expect(plan.baseline).toMatchObject({ version: 2, saleLowMoneyPerKg: 520 });
  });
});

describe("a plan line's Breed", () => {
  /** The farm's own Breed by its English name, given the standard ones the first time it is asked. */
  const breedNamed = async (en: string) => {
    const owner = await asOwner();
    const breeds = await owner.breeds.list();
    const found = breeds.find((one) => one.nameEn === en);
    if (!found) {
      throw new Error(`expected the standard breed ${en}`);
    }
    return found.id;
  };

  /** A second Venture, opened in this file's January, its capital taken and buying begun. */
  const aVentureBuying = async (lines: unknown[], name: string) => {
    const owner = await asOwner();
    const venture = await owner.ventures.open({
      name: `${name} ${suffix}`,
      targetCapitalMoney: 1_800_000,
      floorMoney: 0,
      decideBy: "2053-01-20",
      targetWindowStart: "2053-04-30",
      targetWindowEnd: "2053-05-05",
      unitPriceMoney: 50_000,
      units: 36,
      cattleBudgetMoney: 1_400_000,
    });
    // Its baseline: the plan made while it was still Open.
    await owner.ventures.setPlan({
      ventureId: venture.id,
      lines: lines as typeof LINES,
      ...SALE,
    });
    const him = await owner.investors.record({
      name: `${name} বিনিয়োগকারী ${suffix}`,
      phone: `0177${suffix}`,
    });
    const signed = await owner.ventures.sign({
      ventureId: venture.id,
      investorId: him.id,
      units: 6,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2053-01-02",
      stampSerial: `PB-${name}-${suffix}`,
    });
    await owner.ventures.keepAgreementPaper({
      agreementId: signed.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.ventures.takeCapital({
      agreementId: signed.id,
      amountMoney: 300_000,
      movedOn: "2053-01-03",
      paymentMethod: "bank",
      reference: `TRF-PB-${name}-${suffix}`,
    });
    await owner.ventures.startBuying({ id: venture.id });
    return venture.id;
  };

  it("keeps the Breed a line names, and refuses one the farm does not have", async () => {
    const pabna = await breedNamed("Pabna");
    const owner = await asOwner();
    await owner.ventures.setPlan({
      ventureId,
      lines: [{ ...FIRST, breedId: pabna }],
      ...SALE,
      reason: "পাবনার ষাঁড় কিনব",
    });
    const plan = await owner.ventures.plan({ ventureId });
    expect(plan.latest?.lines[0]?.breedId).toBe(pabna);

    await expect(
      owner.ventures.setPlan({
        ventureId,
        lines: [{ ...FIRST, breedId: "no-such-breed" }],
        ...SALE,
        reason: "ভুল জাত",
      })
    ).rejects.toMatchObject({ data: { refusal: "breed_unknown" } });
  });

  it("refuses a retired Breed a new line names, and keeps one the version before already named", async () => {
    const owner = await asOwner();
    const kept = await owner.breeds.add({ nameBn: `পুরনো জাত ${suffix}` });
    const fresh = await owner.breeds.add({ nameBn: `অবসরের জাত ${suffix}` });
    await owner.ventures.setPlan({
      ventureId,
      lines: [{ ...FIRST, breedId: kept.id }],
      ...SALE,
      reason: "এই জাতই কিনব",
    });
    await owner.breeds.retire({ id: kept.id });
    await owner.breeds.retire({ id: fresh.id });

    // The line the plan already had goes on naming it.
    await expect(
      owner.ventures.setPlan({
        ventureId,
        lines: [{ ...FIRST, breedId: kept.id }],
        saleLowMoneyPerKg: 530,
        saleHighMoneyPerKg: 610,
        reason: "দাম বদলেছে",
      })
    ).resolves.toMatchObject({ ventureId });
    // A line that names a retired Breed for the first time does not.
    await expect(
      owner.ventures.setPlan({
        ventureId,
        lines: [{ ...FIRST, breedId: fresh.id }],
        ...SALE,
        reason: "নতুন জাত",
      })
    ).rejects.toMatchObject({ data: { refusal: "breed_retired" } });
  });

  it("counts a bull bought towards his own Breed's line before an any-Breed one of his weight", async () => {
    const pabna = await breedNamed("Pabna");
    const sahiwalCross = await breedNamed("Sahiwal cross");
    // Five Pabna bulls and five of any Breed, both 200 to 250 kg.
    const id = await aVentureBuying(
      [
        { ...FIRST, animals: 5, dailyGainKg: 0.55, breedId: pabna },
        { ...FIRST, animals: 5, dailyGainKg: 0.8, breedId: null },
      ],
      "জাতের ভেঞ্চার"
    );
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2053-01-21T06:00:00.000Z"),
    });
    const shed = await manager.sheds.createShed({ name: `জাত-শেড ${suffix}` });
    const pen = await manager.sheds.createPen({
      quarantine: true,
      shedId: shed.id,
      name: `জাত-পেন ${suffix}`,
    });
    const trip = await manager.buyingTrips.record({
      wentTo: "পাবনা হাট",
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    const atTheLivestockMarket = await asOwner("2053-01-21T06:00:00.000Z");
    await atTheLivestockMarket.ventures.drawFloat({
      ventureId: id,
      buyingTripId: trip.id,
      amountMoney: 230_000,
      movedOn: "2053-01-21",
      paymentMethod: "bank",
      reference: `FLT-PB-${suffix}`,
    });
    for (const breedId of [pabna, sahiwalCross]) {
      // oxlint-disable-next-line no-await-in-loop -- one bull off the lorry after the other
      await manager.intakes.record({
        penId: pen.id,
        sex: "male",
        seller: { name: `ব্যাপারী ${suffix}` },
        purchasePriceMoney: 105_600,
        weightKg: 220,
        estimatedAgeMonths: 20,
        breedId,
        buyingTripId: trip.id,
        ventureId: id,
        targetWindowStart: "2053-04-30",
        targetWindowEnd: "2053-05-05",
      });
    }

    const owner = await asOwner("2053-01-21T09:00:00.000Z");
    const against = await owner.ventures.planAgainstActual({ ventureId: id });

    // The Pabna bull fills the Pabna line; the Sahiwal cross, whom no line names, the any-Breed one.
    expect(against?.buying.bands.map((one) => one.bought.animals)).toEqual([
      1, 1,
    ]);
  });
});
