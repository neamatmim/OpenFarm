import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Settlement Adjustment paid to every Investor of a settled Venture at once: one transfer from the Farm's own books,
// one Money Event for each Investor, named. Worked by hand: ten Units at ৳50,000, five each to two Investors on a 60%
// split. One bull bought at ৳80,000 and sold for ৳1,00,000 — ৳20,000 profit, ৳12,000 to the Units, ৳1,200 a Unit, so
// each is paid ৳2,56,000. The buyer then makes up ৳20,000 he had underpaid: ৳12,000 more to the Units, ৳6,000 each.

const suffix = `${Date.now()}`.slice(-6);

const at = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

let ventureId = "";
let saleId = "";
let farmAccountId = "";

beforeAll(async () => {
  const { client: owner } = await at("2097-01-02T04:00:00.000Z");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2097/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2099-03-31",
  });
  const venture = await owner.ventures.open({
    name: `দুজনের ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2097-01-02",
    targetWindowStart: "2097-06-01",
    targetWindowEnd: "2097-06-05",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  ventureId = venture.id;
  const agreements: string[] = [];
  for (const [name, phone] of [
    ["করিম", `0171${suffix}1`],
    ["রহিম", `0171${suffix}2`],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor signed at a time
    const person = await owner.investors.record({
      name: `${name} ${suffix}`,
      phone,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    const agreement = await owner.ventures.agreements.sign({
      ventureId,
      investorId: person.id,
      units: 5,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2097-01-02",
      stampSerial: `S-${name}-${suffix}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    await owner.ventures.takeCapital({
      agreementId: agreement.id,
      amountMoney: 250_000,
      movedOn: "2097-01-02",
      paymentMethod: "bank",
      reference: `IN-${name}-${suffix}`,
    });
    agreements.push(agreement.id);
  }
  await owner.ventures.startBuying({ id: ventureId });
  const shed = await owner.sheds.create({ name: `দুজনের ${suffix}` });
  const pen = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const { client: buying } = await at("2097-01-05T06:00:00.000Z");
  const bull = await buying.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2097-01-05T05:00:00.000Z"),
    ventureId,
    targetWindowStart: "2097-06-01",
    targetWindowEnd: "2097-06-05",
    ...PAID_FROM_THE_ACCOUNT,
  });
  const { client: selling } = await at("2097-01-10T06:00:00.000Z");
  const sold = await selling.sales.record({
    tagNumber: bull.tagNumber,
    buyer: { name: `কসাই ${suffix}` },
    destination: "গাবতলী",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceMoney: 100_000,
    weightKg: 300,
    paymentMethod: "bank",
    reference: `SALE-${suffix}`,
  });
  saleId = sold.id;
  const { client: settling } = await at("2097-01-15T06:00:00.000Z");
  await settling.ventures.settlement.approve({ ventureId });
  for (const agreementId of agreements) {
    // oxlint-disable-next-line no-await-in-loop -- one payout at a time
    await settling.ventures.settlement.pay({
      ventureId,
      agreementId,
      amountMoney: 256_000,
      movedOn: "2097-01-15",
      paymentMethod: "bank",
      reference: `OUT-${agreementId}`,
    });
  }
  await settling.ventures.settlement.takeTheFarmsShare({
    ventureId,
    movedOn: "2097-01-15",
    paymentMethod: "bank",
    reference: `FARM-SHARE-${suffix}`,
  });
  // The Farm banks with an account it has listed from here on: everything by bank names it, with its reference.
  const current = await settling.farmAccounts.create({
    kind: "bank",
    name: `চলতি হিসাব ${suffix}`,
    number: `0${suffix}22`,
    bank: "সোনালী ব্যাংক",
    branch: "সাভার",
  });
  farmAccountId = current.id;
});

describe("a Settlement Adjustment paid to several Investors", () => {
  it("goes out as one transfer, one Money Event each, all into the account it left from", async () => {
    const { client: owner } = await at("2097-02-01T04:00:00.000Z");
    const settled = await owner.ventures.settlement.approved({ ventureId });
    expect(settled?.shares.map((one) => one.payoutMoney)).toEqual([
      256_000, 256_000,
    ]);
    await owner.farm.setParameters({ adjustmentThresholdMoney: 1000 });
    await owner.sales.correct({
      id: saleId,
      reason: `ক্রেতা বাকি টাকা দিয়েছে ${suffix}`,
      changes: { priceMoney: { from: 100_000, to: 120_000 } },
    });
    const raised = await owner.ventures.settlement.adjustments.raise({
      ventureId,
      reason: `বিক্রির দাম সংশোধন ${suffix}`,
    });
    expect(raised.outcome).toBe("outstanding");

    const paid = await owner.ventures.settlement.adjustments.pay({
      ventureId,
      adjustmentId: raised.id,
      movedOn: "2097-02-01",
      paymentMethod: "bank",
      reference: `ADJ-${suffix}`,
      farmAccountId,
    });

    expect(paid.paidMoney).toBe(12_000);
    const booked = await scratchDb().query.moneyEvent.findMany({
      where: { farmId: theFarm().id, source: "settlement_adjustment" },
      columns: { amountMoney: true, farmAccountId: true, reference: true },
      orderBy: { reference: "asc" },
    });
    // A Farm Account takes a reference once: each part carries the transfer's, marked with its place.
    expect(booked).toEqual([
      { amountMoney: 6000, farmAccountId, reference: `ADJ-${suffix} · 1/2` },
      { amountMoney: 6000, farmAccountId, reference: `ADJ-${suffix} · 2/2` },
    ]);
  });
});
