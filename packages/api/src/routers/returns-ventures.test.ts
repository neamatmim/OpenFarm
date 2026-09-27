import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What a settled Venture returned, for the Owner — on its cattle, as a Season is worked, and on the Investors' capital —
// and a Farm Season in the same window that must not count the Venture's bulls.
//
// Worked by hand. One Investor, twenty Units: ৳10,00,000 of capital in on 3 January 2053. The Venture buys two bulls at
// ৳1,00,000 each on its Float on 4 January, and on 20 January buys bull X from the Farm by Internal Sale, 250 kg at
// ৳360, for ৳90,000. All three sell on 15 March for ৳1,10,000, ৳1,12,000 and ৳95,000.
// - On its cattle: ৳2,90,000 cost, ৳3,17,000 back, ৳27,000 — 9.3 on every hundred. The two bulls' money was out 70
//   days and X's 54.04, so 2,00,000 × 70 + 90,000 × 54.04 = 1,88,63,750 taka-days, 65.0 days on average, and
//   9.310 × 365 ÷ 65.05 is 52.2 a year.
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
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2053-01-20",
  targetWindowStart: WINDOW.start,
  targetWindowEnd: WINDOW.end,
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

let ventureId = "";

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
  await scheduler.instances.ensureDue();
  const today = await scheduler.instances.today({ penId });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const { client: staff } = await as("staff", `${day}T07:30:00.000Z`);
  await staff.instances.claim({ id: instance.id });
  await staff.instances.completeStep({
    instanceId: instance.id,
    stepId: "weigh",
    animalTag: tagNumber,
    evidence: [kg],
  });
};

const sell = async (tagNumber: string, at: string, priceBdt: number) => {
  const { client } = await as("manager", at);
  await client.sale.record({
    tagNumber,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceBdt,
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
  const shed = await owner.herd.createShed({ name: suffix });
  const pen = await owner.herd.createPen({
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
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2053-01-02",
    stampSerial: `AA 1 ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 1_000_000,
    movedOn: "2053-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.ventures.startBuying({ id: ventureId });

  // Its two bulls, off the lorry on its own Float.
  const { client: buying } = await as("owner", "2053-01-04T04:00:00.000Z");
  const trip = await buying.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2053-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 200_000,
    movedOn: "2053-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const { client: manager } = await as("manager", "2053-01-04T05:00:00.000Z");
  const bull = async (priceBdt: number, forTheVenture: boolean) =>
    await manager.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: priceBdt,
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
  await buying.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: 0,
    movedOn: "2053-01-04",
    reference: `DEP-${suffix}`,
  });

  // X goes from the Farm to the Venture, weighed the morning before.
  await weigh(pen.id, definitionId, "2053-01-19", x.tagNumber, 250);
  const { client: selling } = await as("owner", "2053-01-20T04:00:00.000Z");
  await selling.ventures.sellInternally({
    tagNumber: x.tagNumber,
    toVentureId: ventureId,
    rateBdtPerKg: 360,
    note: `হাটের দর ${suffix}`,
    soldOn: "2053-01-20",
    paymentMethod: "bank",
    reference: `INT-${suffix}`,
    priceBdt: 90_000,
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
      readBdt: believed.expectedBdt,
    });
  }
  await reading.ventures.approveSettlement({ ventureId });
  const { client: paying } = await as("owner", "2053-04-02T04:00:00.000Z");
  const approved = await paying.ventures.approvedSettlement({ ventureId });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await paying.ventures.paySettlement({
      ventureId,
      agreementId: his.agreementId,
      amountBdt: his.payoutBdt,
      movedOn: "2053-04-02",
      paymentMethod: "bank",
      reference: `PAY-${suffix}`,
    });
  }
  await paying.ventures.takeTheFarmsShare({
    ventureId,
    movedOn: "2053-04-02",
    paymentMethod: "bank",
    reference: `FARM-${suffix}`,
  });
});

describe("what a settled Venture returned", () => {
  it("reads its cattle as a Season is read, the bull bought from the Farm among them", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { ventures } = await owner.returns.page();
    expect(ventures.find((one) => one.id === ventureId)).toMatchObject({
      head: 3,
      returnOnCost: {
        costBdt: 290_000,
        backBdt: 317_000,
        resultBdt: 27_000,
        per100: 9.3,
        averageDays: 65,
        perYear: 52.2,
      },
      farmsShareBdt: 10_800,
    });
  });

  it("reads the Investors' capital from the day it arrived to the day it was paid back", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { ventures } = await owner.returns.page();
    expect(
      ventures.find((one) => one.id === ventureId)?.returnOnCapital
    ).toEqual({
      capitalBdt: 1_000_000,
      shareBdt: 16_200,
      per100: 1.6,
      averageDays: 89,
      perYear: 6.6,
    });
  });

  it("works its cattle from the costing to the same totals its Settlement froze", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const approved = await owner.ventures.approvedSettlement({ ventureId });
    const { ventures } = await owner.returns.page();
    const read = ventures.find((one) => one.id === ventureId)?.returnOnCost;
    expect(read?.costBdt).toBe(approved?.chargedBdt);
    expect(read?.backBdt).toBe(approved?.proceedsBdt);
  });
});

describe("a Season beside a Venture in the same window", () => {
  it("counts the Farm's own bulls and not the Venture's, and lets X go at the Internal Sale's price", async () => {
    const { client: owner } = await as("owner", "2053-04-10T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    const season = seasons.find((one) => one.window.start === WINDOW.start);
    expect(season).toMatchObject({
      head: 2,
      finished: true,
      returnOnCost: { costBdt: 170_000, backBdt: 190_000, resultBdt: 20_000 },
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
      await reading.returns.page();
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
