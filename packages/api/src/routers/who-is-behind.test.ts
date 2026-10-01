import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Who is behind on a Venture paid by the month: the Owner's Investors tab says it per Agreement, her list of Ventures
// says what is missed altogether, and the evening's post tells her once a month per Agreement. Nobody else hears, and
// nothing is charged for it.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2076-01-05T04:00:00.000Z";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof asOwner>>;

// Forty thousand of each Unit before buying, then 2,500 on each 10th, February to May.
const TERMS = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2076-01-20",
  targetWindowStart: "2076-06-01",
  targetWindowEnd: "2076-06-10",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

const PAID_UP = `সময়মতো ${suffix}`;
const BEHIND = `পিছিয়ে ${suffix}`;

let phones = 0;
let payments = 0;

const signed = async (
  owner: Owner,
  ventureId: string,
  name: string,
  units: number
) => {
  phones += 1;
  const him = await owner.investors.record({
    name,
    phone: `0178${suffix}${phones}`,
  });
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: him.id,
    units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2076-01-03",
    stampSerial: `WB ${phones} ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

const pay = async (owner: Owner, agreementId: string, amountBdt: number) => {
  payments += 1;
  await owner.ventures.takeCapital({
    agreementId,
    amountBdt,
    movedOn: "2076-01-05",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${payments}`,
  });
};

/** The notices of missed Monthly Sums the Owner has been told of, about this farm's two men. */
const told = async () => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind: "monthly_sum_missed", userId: thePerson("owner").id },
    columns: { params: true },
  });
  return rows
    .map((one) => one.params as { investor?: string; dueOn?: string })
    .filter((one) => one.investor === BEHIND || one.investor === PAID_UP);
};

const sweepOn = async (instant: string) => {
  const owner = await asOwner(instant);
  await owner.alerts.sweep();
};

let ventureId = "";
let paidUp = "";
let behind = "";

beforeAll(async () => {
  // A Manager on the farm, so that "nobody but the Owner" is said of a farm that has somebody else to tell.
  await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(JANUARY),
  });
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `কে পিছিয়ে ${suffix}`,
    ...TERMS,
    capitalPaid: "by_the_month",
  });
  ventureId = venture.id;
  paidUp = await signed(owner, ventureId, PAID_UP, 10);
  behind = await signed(owner, ventureId, BEHIND, 3);
  await pay(owner, paidUp, 400_000);
  await pay(owner, behind, 120_000);
  await owner.ventures.startBuying({ id: ventureId });
  // February's sum, for the one who pays on time.
  await pay(await asOwner("2076-02-10T04:00:00.000Z"), paidUp, 25_000);
});

describe("the Investors tab of a Venture paid by the month", () => {
  it("says per Agreement how many months are paid, what is missed and the next sum", async () => {
    const owner = await asOwner("2076-02-20T04:00:00.000Z");

    const papers = await owner.ventures.agreements({ ventureId });

    const of = new Map(papers.map((one) => [one.id, one.sums]));
    expect(of.get(paidUp)).toMatchObject({
      sumsPaid: 1,
      sums: 4,
      missedBdt: 0,
      next: { dueOn: "2076-03-10", bdt: 25_000 },
    });
    expect(of.get(behind)).toMatchObject({
      sumsPaid: 0,
      missedBdt: 7500,
      lastMissedOn: "2076-02-10",
    });
  });

  it("says what the Venture has missed altogether on the Owner's list", async () => {
    const owner = await asOwner("2076-02-20T04:00:00.000Z");

    const all = await owner.ventures.list();

    expect(all.find((one) => one.id === ventureId)?.sumsMissedBdt).toBe(7500);
  });
});

describe("a missed Monthly Sum in the evening's post", () => {
  it("is told to the Owner once a month per Agreement, from the eighth day after its 10th, and never of a man paid up", async () => {
    await sweepOn("2076-02-17T15:00:00.000Z");
    expect(await told()).toEqual([]);

    await sweepOn("2076-02-18T15:00:00.000Z");
    await sweepOn("2076-02-19T15:00:00.000Z");
    expect(await told()).toMatchObject([
      { investor: BEHIND, dueOn: "2076-02-10" },
    ]);

    // March gone too for the one behind: a second month, told again. The other pays his on its day.
    await pay(await asOwner("2076-03-10T04:00:00.000Z"), paidUp, 25_000);
    await sweepOn("2076-03-20T15:00:00.000Z");
    const both = await told();
    expect(both.map((one) => one.dueOn).toSorted()).toEqual([
      "2076-02-10",
      "2076-03-10",
    ]);
  });

  it("is told to nobody but the Owner", async () => {
    const rows = await scratchDb().query.alert.findMany({
      where: { kind: "monthly_sum_missed" },
      columns: { userId: true, params: true },
    });
    const ours = rows.filter(
      (one) => (one.params as { investor?: string }).investor === BEHIND
    );
    expect(new Set(ours.map((one) => one.userId))).toEqual(
      new Set([thePerson("owner").id])
    );
  });
});
