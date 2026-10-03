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

// A Venture's Return on Cost is worked as its Settlement is (CONTEXT.md, Return on Cost; Holding): what its cattle
// fetched, less what they cost to take on and every charge dated inside its Holding of each. So a Venture whose last
// animal has gone and whose Settlement is approved reads the same result on the Returns page as that Settlement made.
//
// Each Venture below has one thing on an edge of a Holding, so a disagreement names its cause:
// - Venture A: bull A1 sold on 10 January 2054, and a fattening Herd Cost for January entered on the 31st. A1 stood ten
//   days of January, so ten days' part of it is his and the Venture's.
// - Venture B: bull X bought by the Farm and sold to B by Internal Sale on 20 January, saved at ten in the morning;
//   the Vet's fee for a visit that day names X. From the start of the 20th X is B's, so the fee is B's.

const suffix = `agree-${Date.now()}`;
const WINDOW = { start: "2054-03-01", end: "2054-03-05" };

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let penId = "";
let weighInId = "";
let ventureA = "";
let ventureB = "";
let ventureC = "";

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

const weigh = async (day: string, tagNumber: string, kg: number) => {
  const { client: scheduler } = await as("owner", `${day}T07:30:00.000Z`);
  await scheduler.instances.ensureDue();
  const today = await scheduler.instances.today({ penId });
  const instance = today.find((one) => one.definitionId === weighInId);
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

const sell = async (tagNumber: string, at: string, priceMoney: number) => {
  const { client } = await as("manager", at);
  await client.sale.record({
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

/** A bull off the lorry on 4 January: the Venture's on its Float when a trip is given, the Farm's own otherwise. */
const bull = async (
  priceMoney: number,
  forVenture?: { ventureId: string; buyingTripId: string }
) => {
  const { client: manager } = await as("manager", "2054-01-04T05:00:00.000Z");
  const taken = await manager.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: priceMoney,
    weightKg: 250,
    estimatedAgeMonths: 20,
    ...forVenture,
    arrivedAt: new Date("2054-01-04T05:00:00.000Z"),
    targetWindowStart: WINDOW.start,
    targetWindowEnd: WINDOW.end,
  });
  return taken.tagNumber;
};

/**
 * A Venture signed, funded and buying, with its bulls bought on 4 January on a Float that spent every taka drawn: the
 * whole of what it needs before anything happens on an edge.
 */
const aVentureWithBulls = async (
  name: string,
  phone: string,
  prices: number[]
) => {
  const { client: owner } = await as("owner", "2054-01-01T04:00:00.000Z");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2054-01-03",
    targetWindowStart: WINDOW.start,
    targetWindowEnd: WINDOW.end,
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  const person = await owner.investors.record({
    name: `${name} বিনিয়োগকারী ${suffix}`,
    phone,
  });
  const agreement = await owner.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2054-01-02",
    stampSerial: `${name} ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2054-01-02",
    paymentMethod: "bank",
    reference: `TRF-${name}-${suffix}`,
  });
  await owner.ventures.startBuying({ id: venture.id });

  const { client: buying } = await as("owner", "2054-01-04T04:00:00.000Z");
  const trip = await buying.trips.record({
    wentTo: `হাট ${name} ${suffix}`,
    wentOn: "2054-01-04",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  const spentMoney = prices.reduce((sum, one) => sum + one, 0);
  await buying.ventures.drawFloat({
    ventureId: venture.id,
    buyingTripId: trip.id,
    amountMoney: spentMoney,
    movedOn: "2054-01-04",
    paymentMethod: "bank",
    reference: `FLT-${name}-${suffix}`,
  });
  const tags = [];
  for (const priceMoney of prices) {
    // One bull off the lorry at a time, each with the next Tag Number.
    // oxlint-disable-next-line no-await-in-loop -- one bull off the lorry at a time
    const tag = await bull(priceMoney, {
      ventureId: venture.id,
      buyingTripId: trip.id,
    });
    tags.push(tag);
  }
  await buying.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackMoney: 0,
    movedOn: "2054-01-04",
    reference: `DEP-${name}-${suffix}`,
  });
  return { ventureId: venture.id, tags };
};

/** What each Venture's Settlement made, read the moment before it was approved. */
const settledProfit = new Map<string, number>();

/** The Returns page after the last bull went and before either Venture settled. */
type ReturnsPage = Awaited<
  ReturnType<Awaited<ReturnType<typeof as>>["client"]["returns"]["page"]>
>;
let beforeSettling: ReturnsPage | undefined;

/**
 * A Venture settled as the Owner would: January's Reimbursement taken on 20 February for whatever its animals
 * consumed, each month read against the bank, the Settlement approved on 2 March and paid out the same day — what it
 * made kept from the Settlement shown for approval.
 */
const settle = async (ventureId: string, name: string) => {
  const { client: paying } = await as("owner", "2054-02-20T04:00:00.000Z");
  const owed = await paying.ventures.consumption({
    ventureId,
    month: "2054-01",
  });
  if (owed.totalMoney > 0) {
    await paying.ventures.reimburse({
      ventureId,
      month: "2054-01",
      movedOn: "2054-02-20",
      paymentMethod: "bank",
      reference: `REI-${name}-${suffix}`,
      amountMoney: owed.totalMoney,
    });
  }
  const { client: owner } = await as("owner", "2054-03-02T04:00:00.000Z");
  for (const month of ["2054-01", "2054-02"]) {
    // oxlint-disable-next-line no-await-in-loop -- one month at a time
    const believed = await owner.ventures.expectedAtMonthEnd({
      ventureId,
      month,
    });
    // oxlint-disable-next-line no-await-in-loop -- one month at a time
    await owner.ventures.checkTheBank({
      ventureId,
      month,
      readMoney: believed.expectedMoney,
    });
  }
  const shown = await owner.ventures.settlement({ ventureId });
  settledProfit.set(ventureId, shown.profitMoney);
  await owner.ventures.approveSettlement({ ventureId });
  // Settled once the last of the money has gone out: each Investor paid, and the Farm's share taken.
  const approved = await owner.ventures.approvedSettlement({ ventureId });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await owner.ventures.paySettlement({
      ventureId,
      agreementId: his.agreementId,
      amountMoney: his.payoutMoney,
      movedOn: "2054-03-02",
      paymentMethod: "bank",
      reference: `PAY-${name}-${suffix}`,
    });
  }
  await owner.ventures.takeTheFarmsShare({
    ventureId,
    movedOn: "2054-03-02",
    paymentMethod: "bank",
    reference: `FARM-${name}-${suffix}`,
  });
};

/** The settled Venture's result on the Returns page, beside what its Settlement made. */
const bothFigures = async (ventureId: string) => {
  const { client: owner } = await as("owner", "2054-03-03T04:00:00.000Z");
  const page = await owner.returns.page();
  const itsReturn = page.ventures.find((one) => one.id === ventureId);
  return {
    returned: itsReturn?.returnOnCost?.resultMoney,
    settled: settledProfit.get(ventureId) ?? Number.NaN,
  };
};

beforeAll(async () => {
  const { client: owner } = await as("owner", "2054-01-01T04:00:00.000Z");
  await owner.farm.setIdentity({
    address: `গ্রাম: শিমুলিয়া, সাভার ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/SAV/2054/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2056-03-31",
  });
  const shed = await owner.herd.createShed({ name: suffix });
  const pen = await owner.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // The crush is in this Pen, so the person reading the scale has to be assigned to it.
  await as("staff", "2054-01-01T04:00:00.000Z");
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
  weighInId = definitionId;

  // Venture A: A1 sold on the 10th, and January's fly spray entered on the 31st.
  const a = await aVentureWithBulls("ক", "01999000051", [100_000, 100_000]);
  ventureA = a.ventureId;
  const [a1, a2] = a.tags;
  await sell(a1 ?? "", "2054-01-10T05:00:00.000Z", 115_000);
  const spray = await owner.money.addCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  await owner.money.setChargedToAnimals({
    categoryId: spray.id,
    chargedToAnimals: true,
  });
  const { client: manager } = await as("manager", "2054-01-31T10:00:00.000Z");
  await manager.money.enter({
    categoryId: spray.id,
    amountMoney: 9000,
    occurredOn: "2054-01-31",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: suffix,
  });

  // Venture B: X, the Farm's, sold to it on the morning of the 20th, and the Vet's visit that day naming him.
  const b = await aVentureWithBulls("খ", "01999000052", [100_000]);
  ventureB = b.ventureId;
  const x = await bull(80_000);
  await weigh("2054-01-19", x, 250);
  const { client: selling } = await as("owner", "2054-01-20T04:00:00.000Z");
  await selling.ventures.sellInternally({
    tagNumber: x,
    toVentureId: ventureB,
    rateMoneyPerKg: 360,
    note: `হাটের দর ${suffix}`,
    soldOn: "2054-01-20",
    paymentMethod: "bank",
    reference: `INT-${suffix}`,
    priceMoney: 90_000,
  });
  const { client: vet } = await as("vet", "2054-01-20T08:00:00.000Z");
  await vet.money.vetFee({
    amountMoney: 1500,
    visitedOn: "2054-01-20",
    animalTags: [x],
    paymentMethod: "cash",
  });

  // Venture C: one bull, whose Vet visit of 10 February is only entered after the Settlement was paid out.
  const c = await aVentureWithBulls("গ", "01999000053", [100_000]);
  ventureC = c.ventureId;
  const [c1] = c.tags;

  // Every other bull gone the same day, so nothing is left standing on any Venture.
  await sell(a2 ?? "", "2054-02-15T05:00:00.000Z", 112_000);
  await sell(b.tags[0] ?? "", "2054-02-15T05:00:00.000Z", 110_000);
  await sell(x, "2054-02-15T05:00:00.000Z", 97_000);
  await sell(c1 ?? "", "2054-02-15T05:00:00.000Z", 108_000);

  // The Returns page the morning after the last of them went, before either Settlement.
  const { client: reading } = await as("owner", "2054-02-16T04:00:00.000Z");
  beforeSettling = await reading.returns.page();

  await settle(ventureA, "ক");
  await settle(ventureB, "খ");
  await settle(ventureC, "গ");
  // The late news: C's bull was seen by the Vet on 10 February, and the fee is entered on 5 March.
  const { client: lateVet } = await as("vet", "2054-03-05T08:00:00.000Z");
  await lateVet.money.vetFee({
    amountMoney: 1200,
    visitedOn: "2054-02-10",
    animalTags: [c1 ?? ""],
    paymentMethod: "cash",
  });
});

describe("a settled Venture when a cost comes in after its Settlement", () => {
  it("reads its cattle as they cost now, and says how far that is from its Settlement", async () => {
    const { client: owner } = await as("owner", "2054-03-06T04:00:00.000Z");
    const page = await owner.returns.page();
    const itsReturn = page.ventures.find((one) => one.id === ventureC);
    const settled = settledProfit.get(ventureC) ?? Number.NaN;
    expect(itsReturn?.returnOnCost?.resultMoney).toBeCloseTo(settled - 1200, 0);
    expect(itsReturn?.sinceSettlementMoney).toBeCloseTo(-1200, 0);
    // The Investors were paid on the Settlement: their return does not move with the late news.
    expect(itsReturn?.returnOnCapital).not.toBeNull();
  });

  it("says nothing of a Settlement a Venture's figure still agrees with", async () => {
    const { client: owner } = await as("owner", "2054-03-06T04:00:00.000Z");
    const page = await owner.returns.page();
    expect(
      page.ventures.find((one) => one.id === ventureA)?.sinceSettlementMoney
    ).toBeNull();
  });
});

describe("a Venture whose last animal has gone, before its Settlement", () => {
  it("reads its result, not yet settled, the figure its Settlement then makes", () => {
    const itsReturn = beforeSettling?.ventures.find(
      (one) => one.id === ventureA
    );
    expect(itsReturn).toMatchObject({ settled: false, running: null });
    expect(itsReturn?.returnOnCost?.resultMoney).toBeCloseTo(
      settledProfit.get(ventureA) ?? Number.NaN,
      0
    );
    // Nothing of the Investors' capital before it is paid back.
    expect(itsReturn?.returnOnCapital).toBeNull();
  });
});

describe("a Venture's Return and its Settlement", () => {
  it("count the Herd Cost a bull owes for the days he stood before he was sold", async () => {
    const { returned, settled } = await bothFigures(ventureA);
    expect(returned).toBeDefined();
    expect(returned).toBeCloseTo(settled, 0);
  });

  it("count a charge on the morning of an Internal Sale, which is the buyer's day", async () => {
    const { returned, settled } = await bothFigures(ventureB);
    expect(returned).toBeDefined();
    expect(returned).toBeCloseTo(settled, 0);
  });

  it("read what came back from the Sales, which the Venture's account took in to the taka", async () => {
    // The Return reads what each bull fetched off his Sale; the Settlement off the money the account took in for
    // him. The account's movement is written with the Sale and put right with it, so the two are one figure — and
    // this says so, rather than leaving the Return and the Settlement free to drift apart on it.
    const { client: owner } = await as("owner", "2054-03-03T04:00:00.000Z");
    const page = await owner.returns.page();
    const came = await Promise.all(
      [ventureA, ventureB].map(async (ventureId) => {
        const movements = await owner.ventures.movements({ ventureId });
        return {
          back: page.ventures.find((one) => one.id === ventureId)?.returnOnCost
            ?.backMoney,
          inTheAccount: movements
            .filter(
              (one) => one.kind === "sale_in" || one.kind === "internal_sell"
            )
            .reduce((sum, one) => sum + one.amountMoney, 0),
        };
      })
    );
    expect(came).toEqual([
      { back: 115_000 + 112_000, inTheAccount: 115_000 + 112_000 },
      { back: 110_000 + 97_000, inTheAccount: 110_000 + 97_000 },
    ]);
  });
});
