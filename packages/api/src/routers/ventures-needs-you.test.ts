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

  // A Venture that bought nothing, settled the day it began buying: its payout approved and not yet sent.
  settled = await opened(owner, "নিষ্পত্তি");
  await putCapitalIn(
    owner,
    { id: settled, units: 20, unitPriceMoney: 50_000 },
    `${suffix}-settled`,
    "2079-01-02"
  );
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

  it("counts this month's progress statements not yet made, once a month of the run is over", async () => {
    // Its first month is still running: nothing is owed yet.
    expect(await rowOf("2079-01-25T04:00:00.000Z", feeding)).toMatchObject({
      statementsDue: 0,
    });

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
