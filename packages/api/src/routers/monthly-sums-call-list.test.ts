import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Owner rings the Investors who are behind; the farm sends them nothing (the Owner's decision, 2026-10-02). This
// month's Monthly Sums across every Venture paid by the month, missed first, then late, then due — each with the phone
// to ring and how long they have been behind.

const suffix = `${Date.now()}`.slice(-7);
const AT = "2075-01-05T04:00:00.000Z";

const at = async (when: string, as: "owner" | "manager" = "owner") => {
  const { client } = await createTestClient(appRouter, {
    as,
    clock: new FakeClock(when),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof at>>;

// Forty thousand of each Unit before buying, then 2,500 on each 10th, February to May.
const TERMS = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2075-01-20",
  targetWindowStart: "2075-06-01",
  targetWindowEnd: "2075-06-10",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
};

let phones = 0;
let payments = 0;

const signed = async (owner: Owner, ventureId: string, name: string) => {
  phones += 1;
  const phone = `0178${suffix}${phones}`;
  const him = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
  });
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: him.id,
    units: 1,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2075-01-03",
    stampSerial: `CL ${phones} ${suffix}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return { investorId: him.id, agreementId: agreement.id, phone };
};

const pay = async (owner: Owner, agreementId: string, amountMoney: number) => {
  payments += 1;
  await owner.ventures.takeCapital({
    agreementId,
    amountMoney,
    movedOn: "2075-01-05",
    paymentMethod: "bank",
    reference: `CL-${suffix}-${payments}`,
  });
};

type Signed = Awaited<ReturnType<typeof signed>>;
let behind: Signed;
let late: Signed;
let paidUp: Signed;
let lumpSum: Signed;

beforeAll(async () => {
  const owner = await at(AT);
  const monthly = await owner.ventures.open({
    name: `ডাকার তালিকা ${suffix}`,
    ...TERMS,
    capitalPaid: "by_the_month",
  });
  behind = await signed(owner, monthly.id, "পিছিয়ে");
  late = await signed(owner, monthly.id, "দেরি");
  paidUp = await signed(owner, monthly.id, "পরিশোধিত");
  // Each Cattle Part in, and then what each has paid of the sums: none, February's, February's and March's.
  await pay(owner, behind.agreementId, 40_000);
  await pay(owner, late.agreementId, 42_500);
  await pay(owner, paidUp.agreementId, 45_000);
  await owner.ventures.startBuying({ id: monthly.id });

  // A Venture paid before buying has no Monthly Sums at all, however its Investors stand.
  const before = await owner.ventures.open({
    name: `এককালীন ${suffix}`,
    ...TERMS,
    capitalPaid: "before_buying",
  });
  lumpSum = await signed(owner, before.id, "এককালীন");
});

describe("this month's Monthly Sums", () => {
  it("names who has missed and who is late, missed first, with the phone to ring and how long", async () => {
    const owner = await at("2075-03-15T04:00:00.000Z");

    const { rows } = await owner.investors.monthlySums();
    const mine = rows.filter((one) =>
      [behind, late, paidUp, lumpSum].some(
        (him) => him.agreementId === one.agreementId
      )
    );

    expect(mine).toMatchObject([
      {
        agreementId: behind.agreementId,
        standing: "missed",
        phone: behind.phone,
        // February's and March's: everything due, of which February's is past its seven days.
        dueMoney: 5000,
        missedMoney: 2500,
        behindSince: "2075-02-10",
        daysBehind: 33,
      },
      {
        agreementId: late.agreementId,
        standing: "late",
        dueMoney: 2500,
        missedMoney: 0,
        behindSince: "2075-03-10",
        daysBehind: 5,
      },
    ]);
  });

  it("names a sum falling due later this month, and leaves out whoever is paid up to it", async () => {
    const owner = await at("2075-04-05T04:00:00.000Z");

    const { rows } = await owner.investors.monthlySums();
    const paidUpRow = rows.find(
      (one) => one.agreementId === paidUp.agreementId
    );

    // Paid through March: April's falls due on the 10th, and is what to ask him for.
    expect(paidUpRow).toMatchObject({
      standing: "due",
      dueMoney: 2500,
      dueOn: "2075-04-10",
      daysBehind: null,
    });
    // Missed and late come before what is merely due.
    expect(rows.at(-1)?.standing).toBe("due");
  });

  it("leaves out an Agreement paid up beyond this month, and every Venture paid before buying", async () => {
    const owner = await at("2075-03-15T04:00:00.000Z");

    const { rows } = await owner.investors.monthlySums();
    const ids = rows.map((one) => one.agreementId);

    expect(ids).not.toContain(paidUp.agreementId);
    expect(ids).not.toContain(lumpSum.agreementId);
  });

  it("is the Owner's alone", async () => {
    const manager = await at("2075-03-15T04:00:00.000Z", "manager");

    await expect(manager.investors.monthlySums()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
