import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { paperText } from "@OpenFarm/domain";
import { translate } from "@OpenFarm/i18n";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { anInvitedInvestor, theyJoin } from "../test/portal-client";
import { appRouter } from "./index";

// What a settled Venture returned, for the Owner — on its cattle, as a Season is worked, and on the Investors' capital —
// and a Farm Season in the same window that must not count the Venture's bulls.
//
// Worked by hand. One Investor, twenty Units: ৳10,00,000 of capital in on 3 January 2053. The Venture buys two bulls at
// ৳1,00,000 each on its Float on 4 January, and on 20 January buys bull X from the Farm by Internal Sale, 250 kg at
// ৳360, for ৳90,000. All three sell on 15 March for ৳1,10,000, ৳1,12,000 and ৳95,000.
// - On its cattle: ৳2,90,000 cost, ৳3,17,000 back, ৳27,000 — 9.3 on every hundred. The two bulls' money was out 70
//   days and X's 54.46 — from the start of 20 January, the day he was sold on, not the hour it was saved — so
//   2,00,000 × 70 + 90,000 × 54.46 = 1,89,01,250 taka-days, 65.2 days on average, and 9.310 × 365 ÷ 65.18 is 52.1 a
//   year.
// - On capital: sixty per cent of ৳27,000 is ৳16,200, 1.6 on every hundred of ৳10,00,000 held from 3 January to its
//   payout on 2 April, 89 days: 1.62 × 365 ÷ 89 is 6.6 a year. The Farm's share is ৳10,800.
// - The Farm's own: a bull bought on 4 January for ৳90,000 and sold on 18 February for ৳1,00,000, and X, bought on
//   4 January for ৳80,000 and gone to the Venture on 20 January at ৳90,000. Two head, not five: ৳1,70,000 cost and
//   ৳1,90,000 back.

const suffix = `returns-${Date.now()}`;
const WINDOW = { start: "2053-02-17", end: "2053-02-19" };

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const TERMS = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2053-01-20",
  targetWindowStart: WINDOW.start,
  targetWindowEnd: WINDOW.end,
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
};

let ventureId = "";
let investorId = "";
let agreementId = "";

/** A morning's weigh-in off the crush: what an Internal Sale is priced from. */
const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}`, en: "Weigh-in" },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

const weigh = async (
  penId: string,
  definitionId: string,
  day: string,
  tagNumber: string,
  kg: number
) => {
  const { client: scheduler } = await as("owner", `${day}T07:30:00.000Z`);
  await scheduler.work.ensureDue();
  const today = await scheduler.work.today({ penId });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const { client: staff } = await as("staff", `${day}T07:30:00.000Z`);
  await staff.work.claim({ id: instance.id });
  await staff.work.completeStep({
    instanceId: instance.id,
    stepId: "weigh",
    animalTag: tagNumber,
    evidence: [kg],
  });
};

const sell = async (tagNumber: string, at: string, priceMoney: number) => {
  const { client } = await as("manager", at);
  await client.sales.record({
    tagNumber,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceMoney,
    weightKg: 320,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
};

beforeAll(async () => {
  const { client: owner } = await as("owner", "2053-01-01T04:00:00.000Z");
  await owner.farm.setIdentity({
    address: `গ্রাম: শিমুলিয়া, সাভার ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2053/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2055-03-31",
  });
  const shed = await owner.sheds.create({ name: suffix });
  const pen = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  // The crush is in this Pen, so the person reading the scale has to be assigned to it.
  await as("staff", "2053-01-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const { definitionId } = await owner.sops.create({ content: weighInSop() });
  const venture = await owner.ventures.open({
    name: `ফলের ভেঞ্চার ${suffix}`,
    ...TERMS,
  });
  ventureId = venture.id;
  const person = await owner.investors.record({
    name: `রফিক ${suffix}`,
    phone: "01999000041",
  });
  investorId = person.id;
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2053-01-01",
    stampSerial: `AA 1 ${suffix}`,
  });
  agreementId = agreement.id;
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2053-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.ventures.startBuying({ id: ventureId });

  // Its two bulls, off the lorry on its own Float.
  const { client: buying } = await as("owner", "2053-01-04T04:00:00.000Z");
  const trip = await buying.buyingTrips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2053-01-04",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  await buying.ventures.floats.draw({
    ventureId,
    buyingTripId: trip.id,
    amountMoney: 200_000,
    movedOn: "2053-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const { client: manager } = await as("manager", "2053-01-04T05:00:00.000Z");
  const bull = async (priceMoney: number, forTheVenture: boolean) =>
    await manager.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: priceMoney,
      weightKg: 250,
      estimatedAgeMonths: 20,
      ...(forTheVenture ? { buyingTripId: trip.id, ventureId } : {}),
      arrivedAt: new Date("2053-01-04T05:00:00.000Z"),
      targetWindowStart: WINDOW.start,
      targetWindowEnd: WINDOW.end,
    });
  const first = await bull(100_000, true);
  const second = await bull(100_000, true);
  const farms = await bull(90_000, false);
  const x = await bull(80_000, false);
  await buying.ventures.floats.reconcile({
    buyingTripId: trip.id,
    cashBackMoney: 0,
    movedOn: "2053-01-04",
    reference: `DEP-${suffix}`,
  });

  // X goes from the Farm to the Venture, weighed the morning before.
  await weigh(pen.id, definitionId, "2053-01-19", x.tagNumber, 250);
  const { client: selling } = await as("owner", "2053-01-20T04:00:00.000Z");
  await selling.ventures.sellInternally({
    tagNumber: x.tagNumber,
    toVentureId: ventureId,
    rateMoneyPerKg: 360,
    note: `হাটের দর ${suffix}`,
    soldOn: "2053-01-20",
    paymentMethod: "bank",
    reference: `INT-${suffix}`,
    priceMoney: 90_000,
  });

  await sell(farms.tagNumber, "2053-02-18T05:00:00.000Z", 100_000);
  await sell(first.tagNumber, "2053-03-15T05:00:00.000Z", 110_000);
  await sell(second.tagNumber, "2053-03-15T05:00:00.000Z", 112_000);
  await sell(x.tagNumber, "2053-03-15T05:00:00.000Z", 95_000);

  // Every month read against the bank, the Settlement approved, and every taka out.
  const { client: reading } = await as("owner", "2053-04-01T04:00:00.000Z");
  for (const month of ["2053-01", "2053-02", "2053-03"]) {
    // oxlint-disable-next-line no-await-in-loop -- one month at a time
    const believed = await reading.ventures.expectedAtMonthEnd({
      ventureId,
      month,
    });
    // oxlint-disable-next-line no-await-in-loop -- one month at a time
    await reading.ventures.checkTheBank({
      ventureId,
      month,
      readMoney: believed.expectedMoney,
    });
  }
  await reading.ventures.settlement.approve({ ventureId });
  const { client: paying } = await as("owner", "2053-04-02T04:00:00.000Z");
  const approved = await paying.ventures.settlement.approved({ ventureId });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await paying.ventures.settlement.pay({
      ventureId,
      agreementId: his.agreementId,
      amountMoney: his.payoutMoney,
      movedOn: "2053-04-02",
      paymentMethod: "bank",
      reference: `PAY-${suffix}`,
    });
  }
  await paying.ventures.settlement.takeTheFarmsShare({
    ventureId,
    movedOn: "2053-04-02",
    paymentMethod: "bank",
    reference: `FARM-${suffix}`,
  });
});

describe("what a settled Venture returned", () => {
  it("reads its cattle as a Season is read, the bull bought from the Farm among them", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { ventures } = await owner.returns.list();
    expect(ventures.find((one) => one.id === ventureId)).toMatchObject({
      head: 3,
      returnOnCost: {
        costMoney: 290_000,
        backMoney: 317_000,
        resultMoney: 27_000,
        per100: 9.3,
        averageDays: 65,
        perYear: 52.1,
      },
      farmsShareMoney: 10_800,
    });
  });

  it("reads the Investors' capital from the day it arrived to the day it was paid back", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { ventures } = await owner.returns.list();
    expect(
      ventures.find((one) => one.id === ventureId)?.returnOnCapital
    ).toEqual({
      capitalMoney: 1_000_000,
      shareMoney: 16_200,
      per100: 1.6,
      averageDays: 89,
      perYear: 6.6,
    });
  });

  it("works its cattle from the costing to the same totals its Settlement froze", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const approved = await owner.ventures.settlement.approved({ ventureId });
    const { ventures } = await owner.returns.list();
    const read = ventures.find((one) => one.id === ventureId)?.returnOnCost;
    expect(read?.costMoney).toBe(approved?.chargedMoney);
    expect(read?.backMoney).toBe(approved?.proceedsMoney);
  });
});

describe("what the Investor reads of it (ADR 0012)", () => {
  const READ_AT = "2053-04-10T04:00:00.000Z";
  // Rafiq's own: his ৳16,200 on his ৳10,00,000 from 3 January to his payout on 2 April — 1.6 on every hundred over
  // 89 days, as the Owner reads the whole Venture's, since his is the whole of it.
  const HIS = { per100: 1.6, days: 89 };
  /** Nothing of a rate a year, however it might be spelled: a field, the Owner's 6.6 standing as a number of its own — not
   *  inside ৯৬,৬৬৬.৬৭ — or the words for one. */
  const A_YEAR =
    /perYear|(?<![\d০-৯.,])(?:6\.6|৬\.৬)(?![\d০-৯])|বছরে|বার্ষিক|a year|annual|p\.a\./iu;

  const his = async () => {
    const investor = await theyJoin(investorId, "01999000041", READ_AT);
    const portfolio = await investor.portal.portfolio();
    const paper = await investor.portal.paper({
      agreementId,
      kind: "settlement",
    });
    return {
      portfolio,
      theirs: portfolio.agreements.find((one) => one.id === agreementId),
      paper: paperText(paper.document, "bn"),
      english: paperText(paper.document, "en"),
    };
  };

  beforeAll(async () => {
    const { client: owner } = await as("owner", READ_AT);
    await owner.investors.setPortalOpen({ open: true });
  });

  it("shows them nothing of it while the Owner's switch is off, and the Owner in the Preview either way", async () => {
    const { theirs, paper } = await his();
    expect(theirs?.returnOnCapital).toBeNull();
    expect(paper).not.toContain("মূলধনে");
    const { client: owner } = await as("owner", READ_AT);
    const previewed = await owner.portalPreview.portfolio({ investorId });
    expect(
      previewed.agreements.find((one) => one.id === agreementId)
        ?.returnOnCapital
    ).toEqual(HIS);
    // The paper too: its wording is what the advisers read before the switch goes on.
    const previewPaper = await owner.portalPreview.paper({
      investorId,
      agreementId,
      kind: "settlement",
    });
    expect(paperText(previewPaper.document, "bn")).toContain("মূলধনে");
  });

  it("shows them their own share and its days once it is on — in the portal and on their হিসাব নিকাশ, under the payout", async () => {
    const { client: owner } = await as("owner", READ_AT);
    await owner.investors.setReturnsShown({ shown: true });
    const { theirs, paper, english } = await his();
    expect(theirs?.returnOnCapital).toEqual(HIS);
    const lines = paper.split("\n");
    const payout = lines.findIndex((line) => line.includes("মোট প্রাপ্য"));
    const share = lines.findIndex((line) => line.includes("মূলধনে"));
    expect(share).toBeGreaterThan(payout);
    // The portal's sentence and the paper's, one wording: the Bangla half is the portal's word for word.
    expect(lines[share]).toContain(
      translate("bn", "portal.onCapitalGain", { amount: 1.6, days: 89 })
    );
    // And the English the same way, under the payout read in English.
    const englishLines = english.split("\n");
    const englishShare = englishLines.findIndex((line) =>
      line.startsWith("On your capital")
    );
    expect(englishShare).toBeGreaterThan(
      englishLines.findIndex((line) => line.startsWith("Your payout"))
    );
    expect(englishLines[englishShare]).toContain(
      translate("en", "portal.onCapitalGain", { amount: 1.6, days: 89 })
    );
  });

  it("never shows a rate a year, anywhere in their answer, on their paper or in the Owner's Preview of either", async () => {
    const { client: owner } = await as("owner", READ_AT);
    await owner.investors.setReturnsShown({ shown: true });
    const { portfolio, paper, english } = await his();
    const previewed = await owner.portalPreview.portfolio({ investorId });
    const previewPaper = await owner.portalPreview.paper({
      investorId,
      agreementId,
      kind: "settlement",
    });
    for (const said of [
      JSON.stringify(portfolio),
      paper,
      english,
      JSON.stringify(previewed),
      JSON.stringify(previewPaper.document),
    ]) {
      expect(said).not.toMatch(A_YEAR);
    }
  });

  it("is the Owner's to switch, and nobody else's to read", async () => {
    const { client: manager } = await as("manager", READ_AT);
    await expect(
      manager.investors.setReturnsShown({ shown: false })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.portalPreview.portfolio({ investorId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Another Investor has no part in it: nothing of Rafiq's in their answer, and his paper refused.
    const other = await anInvitedInvestor(
      { name: `অন্য ${suffix}`, phone: "01999000042" },
      READ_AT
    );
    const theirs = await other.client.portal.portfolio();
    expect(theirs.agreements.map((one) => one.id)).not.toContain(agreementId);
    await expect(
      other.client.portal.paper({ agreementId, kind: "settlement" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { refusal: "no_such_agreement" },
    });
  });
});

describe("a Season beside a Venture in the same window", () => {
  it("counts the Farm's own bulls and not the Venture's, and lets X go at the Internal Sale's price", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { seasons } = await owner.returns.list();
    const season = seasons.find((one) => one.window.start === WINDOW.start);
    expect(season).toMatchObject({
      head: 2,
      finished: true,
      returnOnCost: {
        costMoney: 170_000,
        backMoney: 190_000,
        resultMoney: 20_000,
      },
    });
  });
});

describe("the Bank Rate beside a Venture", () => {
  it("sets its cattle beside the rate on the day its first bull came, and its capital beside the rate on the day the capital did", async () => {
    // The Investor's money reached the Venture Account on 3 January; its first bulls came off the lorry on the 4th.
    // A rate from the 1st and another from the 4th: a deposit made with the capital would have locked the first, and
    // money spent on cattle the second.
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    await owner.returns.setBankRate({
      perYear: 7,
      note: `সাময়িক হার ${suffix}`,
      fromDay: "2053-01-01",
    });
    await owner.returns.setBankRate({
      perYear: 7.5,
      note: `নতুন হার ${suffix}`,
      fromDay: "2053-01-04",
    });
    const { client: reading } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { ventures, bankRates, bankRateInForceId } =
      await reading.returns.list();
    const venture = ventures.find((one) => one.id === ventureId);
    expect(venture?.bankRate).toEqual({
      perYear: 7.5,
      note: `নতুন হার ${suffix}`,
      fromDay: "2053-01-04",
    });
    expect(venture?.capitalBankRate).toEqual({
      perYear: 7,
      note: `সাময়িক হার ${suffix}`,
      fromDay: "2053-01-01",
    });
    // The one in force today is the later, and the page is told which.
    expect(bankRateInForceId).toBe(bankRates[0]?.id);
    expect(bankRates[0]?.perYear).toBe(7.5);
  });
});

describe("a Venture still going, at today's price", () => {
  let goingId = "";

  beforeAll(async () => {
    // A second Venture, still fattening: its plan sells at ৳600–700 a kilo, and one bull of 250 kg bought for
    // ৳1,00,000 on 4 January stands. At its plan's prices he is worth ৳1,50,000 to ৳1,75,000: 50 to 75 on every
    // hundred, his money out since 4 January — 96 days on 10 April.
    const { client: owner } = await as("owner", "2053-01-02T04:00:00.000Z");
    const shed = await owner.sheds.create({ name: `চলতি ${suffix}` });
    const pen = await owner.sheds.pens.create({
      quarantine: true,
      shedId: shed.id,
      name: `চলতি পেন ${suffix}`,
    });
    const going = await owner.ventures.open({
      name: `চলতি ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    goingId = going.id;
    await owner.ventures.plan.set({
      ventureId: goingId,
      lines: [
        {
          animals: 6,
          fromKg: 240,
          toKg: 260,
          buyMoneyPerKg: 400,
          dailyGainKg: 0.8,
        },
      ],
      saleLowMoneyPerKg: 600,
      saleHighMoneyPerKg: 700,
    });
    const person = await owner.investors.record({
      name: `জসিম ${suffix}`,
      phone: "01999000051",
    });
    const agreement = await owner.ventures.agreements.sign({
      ventureId: goingId,
      investorId: person.id,
      units: 20,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2053-01-01",
      stampSerial: `AA 2 ${suffix}`,
    });
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.ventures.takeCapital({
      agreementId: agreement.id,
      amountMoney: 1_000_000,
      movedOn: "2053-01-03",
      paymentMethod: "bank",
      reference: `TRF-2-${suffix}`,
    });
    await owner.ventures.startBuying({ id: goingId });
    const { client: buying } = await as("owner", "2053-01-04T04:00:00.000Z");
    const trip = await buying.buyingTrips.record({
      wentTo: `হাট ২ ${suffix}`,
      wentOn: "2053-01-04",
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    await buying.ventures.floats.draw({
      ventureId: goingId,
      buyingTripId: trip.id,
      amountMoney: 100_000,
      movedOn: "2053-01-04",
      paymentMethod: "bank",
      reference: `FLT-2-${suffix}`,
    });
    const { client: manager } = await as("manager", "2053-01-04T05:00:00.000Z");
    await manager.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 100_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      buyingTripId: trip.id,
      ventureId: goingId,
      arrivedAt: new Date("2053-01-04T05:00:00.000Z"),
      targetWindowStart: WINDOW.start,
      targetWindowEnd: WINDOW.end,
    });
  });

  it("values its standing bull at its plan's prices, low and high, with no year and no Return on Capital", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const venture = await owner.returns.venture({ ventureId: goingId });
    expect(venture).toMatchObject({
      settled: false,
      head: 1,
      returnOnCost: null,
      returnOnCapital: null,
      farmsShareMoney: null,
      gaps: [],
      running: {
        soldCostMoney: 0,
        soldResultMoney: 0,
        standingCostMoney: 100_000,
        low: { per100: 50, averageDays: 96, perYear: null },
        high: { per100: 75, averageDays: 96, perYear: null },
      },
    });
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager", "2053-04-10T04:00:00.000Z");
    await expect(
      manager.returns.venture({ ventureId: goingId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a Venture buying, with no cattle yet", () => {
  let emptyId = "";

  beforeAll(async () => {
    // Its capital is in and it has started buying, but no bull has come off a lorry: nothing it cost, nothing back,
    // nothing standing — no figure of any kind to say.
    const { client: owner } = await as("owner", "2053-01-02T04:00:00.000Z");
    const empty = await owner.ventures.open({
      name: `খালি ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    emptyId = empty.id;
    const person = await owner.investors.record({
      name: `করিম ${suffix}`,
      phone: "01999000061",
    });
    const agreement = await owner.ventures.agreements.sign({
      ventureId: emptyId,
      investorId: person.id,
      units: 20,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2053-01-01",
      stampSerial: `AA 3 ${suffix}`,
    });
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.ventures.takeCapital({
      agreementId: agreement.id,
      amountMoney: 1_000_000,
      movedOn: "2053-01-03",
      paymentMethod: "bank",
      reference: `TRF-3-${suffix}`,
    });
    await owner.ventures.startBuying({ id: emptyId });
  });

  it("is not on the Returns page, where it would stand as a name with nothing under it", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const page = await owner.returns.list();
    expect(page.ventures.map((one) => one.id)).not.toContain(emptyId);
    expect(await owner.returns.venture({ ventureId: emptyId })).toBeNull();
  });

  it("leaves every Venture with cattle said finished or going by the server, not guessed", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const page = await owner.returns.list();
    const finished = new Map(
      page.ventures.map((one) => [one.id, one.finished])
    );
    expect(finished.get(ventureId)).toBe(true);
    expect([...finished.values()]).toContain(false);
  });
});
