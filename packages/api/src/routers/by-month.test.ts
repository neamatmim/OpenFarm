import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The farm month by month, for the Owner. Nothing in it is a sum of its own: March here has to read as March does on
// Costs by Side and in the accountant's summary, and each Venture as its own plan against actual does — but for the
// Venture's own animals, which are its Settlement's and never the Farm's.
//
// Worked by hand. In March 2044 the Farm buys a bull for ৳50,000 on the 2nd, ৳6,000 of fly spray is charged to the
// fattening animals on the 10th, 100 litres of milk go at ৳60 and 50 at ৳66 on the 12th — ৳9,300, ৳62 a litre — and
// the bull is sold for ৳80,000 on the 15th. Beside him stands a bull a Venture's money bought on the 3rd and sold on
// the 16th, which takes his share of the spray, and whose money and Margin are the Venture's.

const suffix = `${Date.now()}`.slice(-7);
const NOW = "2044-03-20T04:00:00.000Z";
const MARCH = { from: "2044-03-01", to: "2044-03-31" };

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const TERMS = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2044-04-20",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
  targetWindowStart: "2044-06-01",
  targetWindowEnd: "2044-06-05",
};

const PLAN = {
  lines: [
    {
      animals: 6,
      fromKg: 240,
      toKg: 260,
      buyMoneyPerKg: 500,
      dailyGainKg: 0.8,
    },
  ],
  saleLowMoneyPerKg: 600,
  saleHighMoneyPerKg: 700,
};

/** Everything charged to some animals, as Costs by Side lists it line by line. */
const charged = (costs: {
  feedMoney: number;
  medicineMoney: number;
  vetMoney: number;
  marketTollMoney: number;
  tripMoney: number;
  herdMoney: number;
}) =>
  costs.feedMoney +
  costs.medicineMoney +
  costs.vetMoney +
  costs.marketTollMoney +
  costs.tripMoney +
  costs.herdMoney;

let plannedId = "";
let fundedId = "";
let farmsBull = "";

beforeAll(async () => {
  const { client: owner } = await as("owner", "2044-03-01T04:00:00.000Z");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/SAV/2044/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2046-03-31",
  });
  const shed = await owner.herd.createShed({ name: `মাস ${suffix}` });
  const pen = await owner.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });
  const spray = await owner.money.addCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  await owner.money.setChargedToAnimals({
    categoryId: spray.id,
    chargedToAnimals: true,
  });

  const { client: buying } = await as("manager", "2044-03-02T06:00:00.000Z");
  const bull = await buying.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 50_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2044-03-02T00:00:00Z"),
    targetWindowStart: "2044-06-01",
    targetWindowEnd: "2044-06-05",
  });
  const { client: spending } = await as("manager", "2044-03-10T04:00:00.000Z");
  await spending.money.enter({
    categoryId: spray.id,
    amountMoney: 6000,
    occurredOn: "2044-03-10",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
  });
  const { client: sending } = await as("manager", "2044-03-12T04:00:00.000Z");
  const buyer = {
    name: `মিল্ক ভিটা ${suffix}`,
    address: "বাঘাবাড়ী, শাহজাদপুর, সিরাজগঞ্জ",
    phone: "01711222334",
  };
  await sending.milk.dispatch({
    dispatchedAt: new Date("2044-03-12T02:30:00.000Z"),
    litres: 100,
    pricePerLitreMoney: 60,
    buyer,
  });
  await sending.milk.dispatch({
    dispatchedAt: new Date("2044-03-12T03:30:00.000Z"),
    litres: 50,
    pricePerLitreMoney: 66,
    buyer,
  });
  const { client: selling } = await as("manager", "2044-03-15T06:00:00.000Z");
  farmsBull = bull.tagNumber;
  await selling.sale.record({
    tagNumber: bull.tagNumber,
    buyer: {
      name: `কাদের কসাই ${suffix}`,
      address: "গাবতলী, ঢাকা",
      phone: "+8801711000056",
    },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceMoney: 80_000,
    weightKg: 260,
  });

  const planned = await owner.ventures.open({
    name: `জুনের ভেঞ্চার ${suffix}`,
    ...TERMS,
  });
  plannedId = planned.id;
  await owner.ventures.setPlan({ ventureId: plannedId, ...PLAN });
  const calledOff = await owner.ventures.open({
    name: `যে ভেঞ্চার হলো না ${suffix}`,
    ...TERMS,
  });
  await owner.ventures.cancel({ id: calledOff.id, reason: "টাকা ওঠেনি" });

  // A Venture signed for, paid into and buying, and a bull bought on its own Float.
  const funded = await owner.ventures.open({
    name: `ভেঞ্চারের ষাঁড় ${suffix}`,
    ...TERMS,
  });
  fundedId = funded.id;
  const investor = await owner.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: `0193${suffix}`,
  });
  const agreement = await owner.ventures.sign({
    ventureId: fundedId,
    investorId: investor.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2044-03-01",
    stampSerial: `MB ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2044-03-01",
    paymentMethod: "bank",
    reference: `TRF-MB-${suffix}`,
  });
  await owner.ventures.startBuying({ id: fundedId });
  const { client: toTheLivestockMarket } = await as(
    "owner",
    "2044-03-03T04:00:00.000Z"
  );
  const trip = await toTheLivestockMarket.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2044-03-03",
    brokerMoney: 0,
    // Nothing spent on the lorry: what a Venture's outing costs is not what this file is about.
    transportMoney: 0,
    keepMoney: 0,
  });
  await toTheLivestockMarket.ventures.drawFloat({
    ventureId: fundedId,
    buyingTripId: trip.id,
    amountMoney: 100_000,
    movedOn: "2044-03-03",
    paymentMethod: "bank",
    reference: `FLT-MB-${suffix}`,
  });
  const { client: buyingForIt } = await as(
    "manager",
    "2044-03-03T06:00:00.000Z"
  );
  const theirs = await buyingForIt.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 70_000,
    weightKg: 210,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId: fundedId,
    arrivedAt: new Date("2044-03-03T00:00:00Z"),
    targetWindowStart: "2044-06-01",
    targetWindowEnd: "2044-06-05",
  });
  const { client: sellingForIt } = await as(
    "manager",
    "2044-03-16T06:00:00.000Z"
  );
  await sellingForIt.sale.record({
    tagNumber: theirs.tagNumber,
    buyer: {
      name: `কাদের কসাই ${suffix}`,
      address: "গাবতলী, ঢাকা",
      phone: "+8801711000056",
    },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৫",
    driver: "সোহেল",
    priceMoney: 100_000,
    weightKg: 270,
  });
});

describe("the farm month by month", () => {
  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager");
    await expect(manager.home.byMonth()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("reads back a year, oldest first, this month so far", async () => {
    const { client: owner } = await as("owner");
    const { months } = await owner.home.byMonth();

    expect(months.map((one) => one.month)).toEqual([
      "2043-04",
      "2043-05",
      "2043-06",
      "2043-07",
      "2043-08",
      "2043-09",
      "2043-10",
      "2043-11",
      "2043-12",
      "2044-01",
      "2044-02",
      "2044-03",
    ]);
    expect(months.at(-1)?.soFar).toBe(true);
    expect(months.at(-2)?.soFar).toBe(false);
    // A month nothing happened in says so, rather than a price or a Margin nobody made.
    expect(months.at(-2)).toMatchObject({
      money: { inMoney: 0, outMoney: 0, netMoney: 0 },
      dairy: { milkSoldMoney: 0, fetchedPerLitreMoney: null, chargedMoney: 0 },
      fattening: { sold: 0, marginMoney: null, chargedMoney: 0 },
    });
  });

  it("says March as the milk it sold, the accountant, and Costs by Side say it, the Venture's bull left to the Venture", async () => {
    const { client: owner } = await as("owner");
    const { months } = await owner.home.byMonth();
    const march = months.at(-1);
    const { summary } = await owner.reports.accountantExport({
      ...MARCH,
      format: "paper",
    });
    const sides = await owner.costs.bySide(MARCH);
    const his = await owner.costs.ofAnimal({ tagNumber: farmsBull });

    expect(march?.dairy).toMatchObject({
      milkSoldMoney: 9300,
      litresSold: 150,
      fetchedPerLitreMoney: 62,
    });
    expect(march?.dairy.chargedMoney).toBe(charged(sides.dairy));
    expect(march?.money).toEqual({
      inMoney: summary?.incomeMoney,
      outMoney: summary?.expenseMoney,
      netMoney: summary?.netMoney,
      awaitingCount: summary?.awaiting.count,
    });
    // The milk and the Farm's bull in; the Farm's bull and the spray out. The Venture's bull moved its own purse.
    expect(march?.money).toMatchObject({
      inMoney: 89_300,
      outMoney: 56_000,
      netMoney: 33_300,
    });
    // Costs by Side reads the fattening side, whoever owns it: both bulls, and all the spray.
    expect(sides.soldFattening.animals).toHaveLength(2);
    expect(charged(sides.fattening)).toBeCloseTo(6000, 0);
    // The Farm's month is its own bull alone: his Margin, and his share of the spray, which the Venture's bull halved.
    expect(march?.fattening).toMatchObject({
      sold: 1,
      marginMoney: his.marginMoney,
      chargedMoney: charged(his),
    });
    expect(march?.fattening.marginMoney).toBeGreaterThan(24_000);
    expect(march?.fattening.chargedMoney).toBeLessThan(6000);
  });

  it("says the year as the accountant says the same twelve months, worked over all of them", async () => {
    const { client: owner } = await as("owner");
    const { year } = await owner.home.byMonth();
    const { summary } = await owner.reports.accountantExport({
      from: "2043-04-01",
      to: "2044-03-31",
      format: "paper",
    });

    expect(year.money).toMatchObject({
      inMoney: summary?.incomeMoney,
      outMoney: summary?.expenseMoney,
      netMoney: summary?.netMoney,
    });
    const his = await owner.costs.ofAnimal({ tagNumber: farmsBull });
    expect(year).toMatchObject({
      money: { netMoney: 33_300 },
      dairy: { milkSoldMoney: 9300, fetchedPerLitreMoney: 62 },
      fattening: { sold: 1, marginMoney: his.marginMoney },
    });
  });

  it("sets each Venture that was not called off against its plan, as its own page does", async () => {
    const { client: owner } = await as("owner");
    const { ventures } = await owner.home.byMonth();
    const measured = await owner.ventures.planAgainstActual({
      ventureId: plannedId,
    });

    expect(ventures.map((one) => one.id)).toEqual([plannedId, fundedId]);
    expect(ventures[0]).toMatchObject({
      state: "open",
      planned: measured?.money.planned,
      projected: measured?.money.projected,
      settledProfitMoney: null,
    });
    expect(ventures[0]?.planned?.lowMoney).toBeDefined();
  });
});
