import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { invitingInvestors, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// What on each Venture waits for the Owner, beside what the list already said (a decision, notes, budget, wind-up,
// the bank): Monthly Sums missed, a month's Reimbursement owed the Farm, this month's progress statements not yet
// made, Requests to Join not answered, and payouts approved but not sent.

const suffix = `needs-${Date.now()}`;
const JANUARY = "2079-01-02T04:00:00.000Z";

const at = async (when: string) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(when),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof at>>;

const TERMS = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2079-01-02",
  targetWindowStart: "2079-09-01",
  targetWindowEnd: "2079-09-05",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
};

const opened = async (owner: Owner, name: string) => {
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    ...TERMS,
  });
  await owner.ventures.setBankAccount({
    id: venture.id,
    bank: "Test bank",
    accountName: "Venture account",
    accountNumber: `NY-${venture.id}`,
  });
  return venture.id;
};

const rowOf = async (when: string, id: string) => {
  const owner = await at(when);
  const rows = await owner.ventures.list();
  return rows.find((one) => one.id === id);
};

const invited = invitingInvestors({ prefix: "016", run: suffix }, JANUARY);

let asked = "";
let feeding = "";
let settled = "";
let sprayId = "";

beforeAll(async () => {
  const owner = await at(JANUARY);
  await owner.farm.setIdentity({
    address: "Test farm",
    phone: "+8801711000096",
    registrationNumber: `NY-${suffix}`,
    registrationOffice: "Test office",
    registrationExpiresOn: "2090-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });

  // An Open Venture shown in the portal, which one invited Investor asks to join — and another asks and takes it back.
  asked = await opened(owner, "অনুরোধ");
  await owner.ventures.showInPortal({ id: asked, words: "" });
  const him = await invited("অনুরোধকারী");
  const portal = await signedInAs(him.loginEmail, "2079-01-02T05:00:00.000Z");
  await portal.portal.requestToJoin({ ventureId: asked, units: 2, note: "" });
  const other = await invited("ফিরিয়ে নেওয়া");
  const otherPortal = await signedInAs(
    other.loginEmail,
    "2079-01-02T05:00:00.000Z"
  );
  const theirs = await otherPortal.portal.requestToJoin({
    ventureId: asked,
    units: 1,
    note: "",
  });
  await otherPortal.portal.withdrawRequest({ requestId: theirs.id });

  // A Venture buying since January, whose one bull ate what the Farm bought for her in January.
  feeding = await opened(owner, "খাওয়ানো");
  await putCapitalIn(
    owner,
    { id: feeding, units: 20, unitPriceMoney: 50_000 },
    `${suffix}-feeding`,
    "2079-01-02"
  );
  await owner.ventures.startBuying({ id: feeding });
  const shed = await owner.sheds.create({ name: suffix });
  const pen = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const spray = await owner.money.categories.create({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  sprayId = spray.id;
  await owner.money.categories.setChargedToAnimals({
    categoryId: spray.id,
    chargedToAnimals: true,
  });
  const buyer = await at("2079-01-02T06:00:00.000Z");
  await buyer.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2079-01-02T05:00:00.000Z"),
    ventureId: feeding,
    ...PAID_FROM_THE_ACCOUNT,
  });
  const later = await at("2079-01-20T06:00:00.000Z");
  await later.money.enter({
    categoryId: spray.id,
    amountMoney: 3000,
    occurredOn: "2079-01-20",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `spray ${suffix}`,
  });

  // A Venture that bought nothing, settled the day it began buying: one Investor's payout approved and not yet sent,
  // and another who signed and paid nothing, whose share comes to nothing to send.
  settled = await opened(owner, "নিষ্পত্তি");
  await putCapitalIn(
    owner,
    { id: settled, units: 10, unitPriceMoney: 50_000 },
    `${suffix}-settled`,
    "2079-01-02"
  );
  const paidNothing = await owner.investors.record({
    name: `কিছু দেননি ${suffix}`,
    phone: `0175${`${Date.now()}`.slice(-7)}`,
  });
  const unpaid = await owner.ventures.agreements.sign({
    ventureId: settled,
    investorId: paidNothing.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2079-01-02",
    stampSerial: `NY-UNPAID-${suffix}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: unpaid.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.startBuying({ id: settled });
  await owner.ventures.settlement.approve({ ventureId: settled });
});

describe("what on a Venture waits for the Owner", () => {
  it("counts the Requests to Join still waiting for her answer", async () => {
    expect(await rowOf(JANUARY, asked)).toMatchObject({ requestsWaiting: 1 });
  });

  it("names the month a running Venture owes the Farm, until it is repaid", async () => {
    const february = "2079-02-05T04:00:00.000Z";
    expect(await rowOf(february, feeding)).toMatchObject({
      reimbursementDue: { month: "2079-01" },
    });

    const owner = await at(february);
    const figure = await owner.ventures.consumption({
      ventureId: feeding,
      month: "2079-01",
    });
    await owner.ventures.reimburse({
      ventureId: feeding,
      month: "2079-01",
      movedOn: "2079-02-05",
      paymentMethod: "bank",
      reference: `REI-${suffix}`,
      amountMoney: figure.totalMoney,
    });

    expect(await rowOf(february, feeding)).toMatchObject({
      reimbursementDue: null,
    });
  });

  it("names last month as owed with what its transfer would carry, a repaid month's late cost included", async () => {
    // January was repaid on the 5th of February; a January cost written later carries into February's transfer, though
    // February itself cost the bull nothing.
    const late = await at("2079-02-20T06:00:00.000Z");
    await late.money.enter({
      categoryId: sprayId,
      amountMoney: 1500,
      occurredOn: "2079-01-28",
      counterparty: { name: `দোকান ${suffix}` },
      paymentMethod: "cash",
      side: "fattening",
      note: `late spray ${suffix}`,
    });

    const march = "2079-03-05T04:00:00.000Z";
    const owner = await at(march);
    const figure = await owner.ventures.consumption({
      ventureId: feeding,
      month: "2079-02",
    });
    expect(figure.totalMoney).toBeGreaterThan(0);
    expect(await rowOf(march, feeding)).toMatchObject({
      reimbursementDue: { month: "2079-02", owedMoney: figure.totalMoney },
    });
  });

  it("counts this month's progress statements not yet made", async () => {
    const march = "2079-03-03T04:00:00.000Z";
    expect(await rowOf(march, feeding)).toMatchObject({ statementsDue: 1 });

    const owner = await at(march);
    const [agreement] = await owner.ventures.agreements.list({
      ventureId: feeding,
    });
    await owner.investorStatements.progress({
      agreementId: agreement?.id ?? "",
    });

    expect(await rowOf(march, feeding)).toMatchObject({ statementsDue: 0 });
  });

  it("counts the payouts approved and not yet sent", async () => {
    expect(await rowOf(JANUARY, settled)).toMatchObject({ payoutsUnsent: 1 });
  });
});

describe("the progress statements a Venture's card counts", () => {
  const MARCH_FIRST = "2079-03-01T04:00:00.000Z";
  const MARCH_THIRD = "2079-03-03T04:00:00.000Z";

  /** A Venture opened on the first of March, buying from the same day, with the Farm's own Units where asked. */
  const buyingFromMarch = async (name: string, farmUnits = 0) => {
    const owner = await at(MARCH_FIRST);
    const venture = await owner.ventures.open({
      name: `${name} ${suffix}`,
      ...TERMS,
      decideBy: "2079-03-01",
    });
    await owner.ventures.setBankAccount({
      id: venture.id,
      bank: "Test bank",
      accountName: "Venture account",
      accountNumber: `NY-${venture.id}`,
    });
    if (farmUnits > 0) {
      const farms = await owner.ventures.agreements.farmTakes({
        ventureId: venture.id,
        units: farmUnits,
      });
      await owner.ventures.takeCapital({
        agreementId: farms.id,
        amountMoney: farmUnits * TERMS.unitPriceMoney,
        movedOn: "2079-03-01",
        paymentMethod: "bank",
        reference: `FARM-${name}-${suffix}`,
      });
    }
    await putCapitalIn(
      owner,
      {
        id: venture.id,
        units: TERMS.units - farmUnits,
        unitPriceMoney: TERMS.unitPriceMoney,
      },
      `${suffix}-${name}`,
      "2079-03-01"
    );
    await owner.ventures.startBuying({ id: venture.id });
    return venture.id;
  };

  /** Whether the Owner's list still holds this Venture's notice that its statements are due, after a sweep. */
  const noticeStands = async (when: string, ventureId: string) => {
    const owner = await at(when);
    await owner.alerts.sweep();
    const mine = await owner.alerts.mine({ about: ventureId });
    return mine.some((one) => one.kind === "investor_statement_due");
  };

  it("never counts the Farm's own Units, which are no Investor to hand a paper to", async () => {
    const ventureId = await buyingFromMarch("খামারের অংশ", 10);

    expect(await rowOf(MARCH_THIRD, ventureId)).toMatchObject({
      statementsDue: 1,
    });
  });

  it("agrees with the notice: owed in a Venture's first month, and not once its paper is made", async () => {
    const ventureId = await buyingFromMarch("প্রথম মাস");

    expect(await rowOf(MARCH_THIRD, ventureId)).toMatchObject({
      statementsDue: 1,
    });
    expect(await noticeStands(MARCH_THIRD, ventureId)).toBe(true);

    const owner = await at(MARCH_THIRD);
    const [agreement] = await owner.ventures.agreements.list({ ventureId });
    await owner.investorStatements.progress({
      agreementId: agreement?.id ?? "",
    });

    expect(await rowOf(MARCH_THIRD, ventureId)).toMatchObject({
      statementsDue: 0,
    });
    expect(await noticeStands(MARCH_THIRD, ventureId)).toBe(false);
  });

  it("agrees with the notice about a paper made before the notice was raised", async () => {
    const ventureId = await buyingFromMarch("আগে দেওয়া");
    const owner = await at(MARCH_FIRST);
    const [agreement] = await owner.ventures.agreements.list({ ventureId });
    await owner.investorStatements.progress({
      agreementId: agreement?.id ?? "",
    });

    expect(await rowOf(MARCH_THIRD, ventureId)).toMatchObject({
      statementsDue: 0,
    });
    expect(await noticeStands(MARCH_THIRD, ventureId)).toBe(false);
  });
});
