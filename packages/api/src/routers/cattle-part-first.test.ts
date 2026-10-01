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
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2074-01-20",
  targetWindowStart: "2074-06-01",
  targetWindowEnd: "2074-06-10",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

let phones = 0;

/** An Investor signed for so many Units of a Venture, his stamped paper kept. */
const signed = async (owner: Owner, ventureId: string, units: number) => {
  phones += 1;
  const him = await owner.investors.record({
    name: `বিনিয়োগকারী ${phones} ${suffix}`,
    phone: `0176${suffix}${phones}`,
  });
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: him.id,
    units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2074-01-03",
    stampSerial: `CP ${phones} ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

const pay = async (owner: Owner, agreementId: string, amountBdt: number) =>
  await owner.ventures.takeCapital({
    agreementId,
    amountBdt,
    movedOn: "2074-01-05",
    paymentMethod: "bank",
    reference: `TRF-${agreementId.slice(-6)}-${amountBdt}`,
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

    const papers = await owner.ventures.agreements({ ventureId: monthly });

    const left = new Map(papers.map((one) => [one.id, one.capitalLeftBdt]));
    expect(left.get(tenUnits)).toBe(0);
    // Three Units' cattle money is 1,20,000; a lakh is in.
    expect(left.get(threeUnits)).toBe(20_000);
  });

  it("will not start buying while any signed Cattle Part is short, and says how much", async () => {
    const owner = await asOwner();

    const venture = await listed(owner, monthly);
    expect(venture?.cattleMoneyShortBdt).toBe(20_000);
    await expect(
      owner.ventures.startBuying({ id: monthly })
    ).rejects.toMatchObject({ data: { refusal: "cattle_money_short" } });
  });

  it("will not let a Correction carry a payment past its Cattle Part", async () => {
    const owner = await asOwner();
    const { id } = await pay(owner, threeUnits, 10_000);

    await expect(
      owner.ventures.correctMovement({
        id,
        reason: `বেশি লিখতে চাই ${suffix}`,
        changes: { amountBdt: { from: 10_000, to: 30_000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "capital_over_cattle_part" } });
  });
});

describe("a Venture paid by the month, once every Cattle Part is in", () => {
  it("starts buying, holding all its capital as cattle money and none yet to keep them", async () => {
    const owner = await asOwner();
    await pay(owner, threeUnits, 10_000);

    const allIn = await listed(owner, monthly);
    expect(allIn?.cattleMoneyShortBdt).toBe(0);
    await owner.ventures.startBuying({ id: monthly });

    const venture = await listed(owner, monthly);
    // Five lakh twenty thousand in, every taka of it the signed Units' Cattle Parts.
    expect(venture).toMatchObject({
      state: "buying",
      cattleBudgetHeldBdt: 520_000,
      runningBudgetHeldBdt: 0,
    });
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
    expect(partPaid?.cattleMoneyShortBdt).toBe(0);
    await owner.ventures.startBuying({ id });

    // Eighty per cent of it for cattle, as the plan is: 2,40,000 and 60,000.
    expect(await listed(owner, id)).toMatchObject({
      cattleBudgetHeldBdt: 240_000,
      runningBudgetHeldBdt: 60_000,
    });
  });
});
