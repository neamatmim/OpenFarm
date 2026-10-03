import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Venture paid by the month takes its Monthly Sums once the buying starts and until the selling does, into the
// money that keeps the animals — never more than an Agreement signed for. Paid in full, it settles exactly as a Venture
// paid before buying would.

const suffix = `${Date.now()}`.slice(-7);
const AT = "2075-01-05T04:00:00.000Z";

const asOwner = async (at = AT) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof asOwner>>;

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

const signed = async (owner: Owner, ventureId: string, units: number) => {
  phones += 1;
  const him = await owner.investors.record({
    name: `বিনিয়োগকারী ${phones} ${suffix}`,
    phone: `0177${suffix}${phones}`,
  });
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: him.id,
    units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2075-01-03",
    stampSerial: `MS ${phones} ${suffix}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

let payments = 0;

const pay = async (owner: Owner, agreementId: string, amountMoney: number) => {
  payments += 1;
  return await owner.ventures.takeCapital({
    agreementId,
    amountMoney,
    movedOn: "2075-01-05",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${payments}`,
  });
};

const listed = async (owner: Owner, id: string) => {
  const all = await owner.ventures.list();
  return all.find((one) => one.id === id);
};

let monthly = "";
let tenUnits = "";
let threeUnits = "";

beforeAll(async () => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `মাসের টাকা ${suffix}`,
    ...TERMS,
    capitalPaid: "by_the_month",
  });
  monthly = venture.id;
  tenUnits = await signed(owner, monthly, 10);
  threeUnits = await signed(owner, monthly, 3);
  await pay(owner, tenUnits, 400_000);
  await pay(owner, threeUnits, 120_000);
  await owner.ventures.startBuying({ id: monthly });
});

describe("a Venture paid by the month, buying", () => {
  it("takes a Monthly Sum into the money that keeps the animals, and none into the cattle money", async () => {
    const owner = await asOwner("2075-02-10T04:00:00.000Z");

    await pay(owner, tenUnits, 25_000);

    expect(await listed(owner, monthly)).toMatchObject({
      cattleBudgetHeldMoney: 520_000,
      runningBudgetHeldMoney: 25_000,
    });
  });

  it("takes no more than an Agreement signed for", async () => {
    const owner = await asOwner("2075-02-10T04:00:00.000Z");

    // Ten Units are five lakh; 4,25,000 is in, so 75,000 is all it may take.
    await expect(pay(owner, tenUnits, 75_001)).rejects.toMatchObject({
      data: { refusal: "capital_over_units" },
    });
  });
});

describe("a Venture paid by the month, fattening", () => {
  it("still takes a sum paid late, and once every sum is in it divides by the Units signed for", async () => {
    const owner = await asOwner("2075-05-20T04:00:00.000Z");
    await owner.ventures.startFattening({ id: monthly });

    // Everything left, February's late sums included.
    await pay(owner, tenUnits, 75_000);
    await pay(owner, threeUnits, 30_000);

    const settlement = await owner.ventures.settlement.get({
      ventureId: monthly,
    });
    expect(settlement.units).toBe(13);
    expect(
      settlement.payouts.map((one) => one.units).toSorted((a, b) => a - b)
    ).toEqual([3, 10]);
  });
});

describe("a Venture paid before buying", () => {
  it("takes no capital once it is buying, as before", async () => {
    const owner = await asOwner();
    const { id } = await owner.ventures.open({
      name: `একবারে ${suffix}`,
      ...TERMS,
    });
    const paper = await signed(owner, id, 2);
    await pay(owner, paper, 50_000);
    await owner.ventures.startBuying({ id });

    await expect(pay(owner, paper, 50_000)).rejects.toMatchObject({
      data: { refusal: "venture_wrong_state" },
    });
  });
});
