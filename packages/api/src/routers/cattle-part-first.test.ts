import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Venture paid by the month takes each Unit's Cattle Part before the buying, and the buying waits on all of it: the
// Monthly Sums keep the animals and buy none. Everything that comes in before the buying is cattle money.

const suffix = `${Date.now()}`.slice(-7);
const AT = "2074-01-05T04:00:00.000Z";

const asOwner = async (at = AT) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof asOwner>>;

// A Unit of fifty thousand: forty thousand of cattle money, then 2,500 on the 10th, February to May.
const TERMS = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2074-01-20",
  targetWindowStart: "2074-06-01",
  targetWindowEnd: "2074-06-10",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
};

let phones = 0;

/** An Investor signed for so many Units of a Venture, his stamped paper kept. */
const signed = async (owner: Owner, ventureId: string, units: number) => {
  phones += 1;
  const him = await owner.investors.record({
    name: `বিনিয়োগকারী ${phones} ${suffix}`,
    phone: `0176${suffix}${phones}`,
  });
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: him.id,
    units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2074-01-03",
    stampSerial: `CP ${phones} ${suffix}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

const pay = async (owner: Owner, agreementId: string, amountMoney: number) =>
  await owner.ventures.takeCapital({
    agreementId,
    amountMoney,
    movedOn: "2074-01-05",
    paymentMethod: "bank",
    reference: `TRF-${agreementId.slice(-6)}-${amountMoney}`,
  });

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
    name: `গরুর টাকা আগে ${suffix}`,
    ...TERMS,
    capitalPaid: "by_the_month",
  });
  monthly = venture.id;
  tenUnits = await signed(owner, monthly, 10);
  threeUnits = await signed(owner, monthly, 3);
});

describe("a Venture paid by the month, while it gathers its capital", () => {
  it("takes an Agreement's Cattle Part and not a taka of its Monthly Sums", async () => {
    const owner = await asOwner();

    await expect(pay(owner, tenUnits, 400_001)).rejects.toMatchObject({
      data: { refusal: "capital_over_cattle_part" },
    });
    await pay(owner, tenUnits, 400_000);
    await expect(pay(owner, tenUnits, 1)).rejects.toMatchObject({
      data: { refusal: "capital_over_cattle_part" },
    });
  });

  it("tells the Owner's capital form what is left of each Cattle Part", async () => {
    const owner = await asOwner();
    await pay(owner, threeUnits, 100_000);

    const papers = await owner.ventures.agreements.list({ ventureId: monthly });

    const left = new Map(papers.map((one) => [one.id, one.capitalLeftMoney]));
    expect(left.get(tenUnits)).toBe(0);
    // Three Units' cattle money is 1,20,000; a lakh is in.
    expect(left.get(threeUnits)).toBe(20_000);
  });

  it("will not start buying while any signed Cattle Part is short, and says how much", async () => {
    const owner = await asOwner();

    const venture = await listed(owner, monthly);
    expect(venture?.cattleMoneyShortMoney).toBe(20_000);
    await expect(
      owner.ventures.startBuying({ id: monthly })
    ).rejects.toMatchObject({ data: { refusal: "cattle_money_short" } });
  });

  it("will not let a Correction carry a payment past its Cattle Part", async () => {
    const owner = await asOwner();
    const { id } = await pay(owner, threeUnits, 10_000);

    await expect(
      owner.ventures.movements.correct({
        id,
        reason: `বেশি লিখতে চাই ${suffix}`,
        changes: { amountMoney: { from: 10_000, to: 30_000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "capital_over_cattle_part" } });
  });
});

describe("a Venture paid by the month, once every Cattle Part is in", () => {
  it("starts buying, holding all its capital as cattle money and none yet to keep them", async () => {
    const owner = await asOwner();
    await pay(owner, threeUnits, 10_000);

    const allIn = await listed(owner, monthly);
    expect(allIn?.cattleMoneyShortMoney).toBe(0);
    await owner.ventures.startBuying({ id: monthly });

    const venture = await listed(owner, monthly);
    // Five lakh twenty thousand in, every taka of it the signed Units' Cattle Parts.
    expect(venture).toMatchObject({
      state: "buying",
      cattleBudgetHeldMoney: 520_000,
      runningBudgetHeldMoney: 0,
    });
  });

  it("draws a Float to the livestock market against the cattle money it holds", async () => {
    const owner = await asOwner();
    const trip = await owner.buyingTrips.record({
      wentTo: `হাট ${suffix}`,
      wentOn: "2074-01-05",
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    // A lakh of the five lakh twenty thousand its signed Units' Cattle Parts brought in.
    await owner.ventures.floats.draw({
      ventureId: monthly,
      buyingTripId: trip.id,
      amountMoney: 100_000,
      movedOn: "2074-01-05",
      paymentMethod: "bank",
      reference: `FLT-${suffix}`,
    });
    const venture = await listed(owner, monthly);
    expect(venture?.cattleBudgetHeldMoney).toBe(420_000);
  });
});

describe("a Venture paid before buying", () => {
  it("divides its capital between the budgets as its plan does, and starts on its Floor with a paper part paid", async () => {
    const owner = await asOwner();
    const { id } = await owner.ventures.open({
      name: `একবারে ${suffix}`,
      ...TERMS,
    });
    const paper = await signed(owner, id, 10);
    await pay(owner, paper, 300_000);

    const partPaid = await listed(owner, id);
    expect(partPaid?.cattleMoneyShortMoney).toBe(0);
    await owner.ventures.startBuying({ id });

    // Eighty per cent of it for cattle, as the plan is: 2,40,000 and 60,000.
    expect(await listed(owner, id)).toMatchObject({
      cattleBudgetHeldMoney: 240_000,
      runningBudgetHeldMoney: 60_000,
    });
  });
});

describe("a Venture paid by the month and its Floor", () => {
  const withTheFarmsFloor = async (owner: Owner, name: string) => {
    // No Floor of its own: the farm's percentage of the capital, which is more than the Cattle Parts can ever hold.
    const { floorMoney: _none, ...rest } = TERMS;
    const { id } = await owner.ventures.open({
      name: `${name} ${suffix}`,
      ...rest,
      capitalPaid: "by_the_month",
    });
    return id;
  };

  it("counts the capital its signed Units are for, so it starts on its Cattle Parts once enough is signed", async () => {
    const owner = await asOwner();
    const id = await withTheFarmsFloor(owner, "যথেষ্ট সই");
    const paper = await signed(owner, id, 16);
    await pay(owner, paper, 640_000);

    await owner.ventures.startBuying({ id });

    const venture = await listed(owner, id);
    expect(venture?.state).toBe("buying");
  });

  it("will not start while the signed Units come to less than the Floor", async () => {
    const owner = await asOwner();
    const id = await withTheFarmsFloor(owner, "কম সই");
    const paper = await signed(owner, id, 10);
    await pay(owner, paper, 400_000);

    await expect(owner.ventures.startBuying({ id })).rejects.toMatchObject({
      data: { refusal: "venture_under_floor" },
    });
  });
});
