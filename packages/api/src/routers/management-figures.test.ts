import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The monthly report's management figures (ADR 0023), worked by hand over May 2046.
//
// From midnight on 1 May a heifer stands on the Dairy side, the Farm's own bull bought for ৳50,000 and a bull a
// Venture's money bought stand on the Fattening side. The dairy animals are charged ৳3,000 of spray on the 5th, 100
// liters of milk go at ৳60 on the 10th, and the Farm's bull is sold for ৳80,000 at midnight on the 20th. The shed rent
// is ৳8,100: over the 31 + 19 + 31 = 81 head-days, ৳100 a head a day.
//
// The milk went on credit, promised for the 25th: on 31 May its ৳6,000 is 21 days old and overdue. The bull's buyer paid
// ৳50,000 at the gate and promised the rest by 5 June: ৳30,000, 11 days old and not yet due. The milk buyer pays
// ৳3,000 on 3 June, which May's end knows nothing of.
//
// Into the store on the 2nd: 1,000 kg of concentrate for ৳40,000, and on the 4th ten doses of a wormer for ৳5,000.
// Nothing is fed or dosed from them in May, so at May's end the store is worth ৳45,000; at April's, nothing.

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** Midnight on 1 May on the farm's own clock. */
const FIRST_OF_MAY = "2046-04-30T18:00:00.000Z";
const NOW = "2046-06-10T04:00:00.000Z";
const WINDOW = {
  targetWindowStart: "2046-08-01",
  targetWindowEnd: "2046-08-05",
};

const category: Record<string, string> = {};

const spend = async (entry: {
  categoryId: string;
  amountMoney: number;
  occurredOn: string;
  side?: "dairy" | "fattening";
}) => {
  const owner = await as("owner", `${entry.occurredOn}T04:00:00.000Z`);
  await owner.client.money.enter({
    ...entry,
    counterparty: { name: "দোকান" },
    paymentMethod: "cash",
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2046-04-25T04:00:00.000Z");
  for (const one of await owner.client.money.categories.list()) {
    if (one.key) {
      category[one.key] = one.id;
    }
  }
  const spray = await owner.client.money.categories.create({
    nameBn: "মাছি স্প্রে",
    direction: "out",
  });
  await owner.client.money.categories.setChargedToAnimals({
    categoryId: spray.id,
    chargedToAnimals: true,
  });
  const shed = await owner.client.sheds.create({ name: "খামার" });
  const bulls = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: "ষাঁড় পেন",
  });
  const cows = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: "গাভী পেন",
  });
  const venture = await owner.client.ventures.open({
    name: "ঈদ ভেঞ্চার",
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2046-04-28",
    ...WINDOW,
    unitPriceMoney: 50_000,
    units: 10,
  });
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 10, unitPriceMoney: 50_000 },
    "management",
    "2046-04-25"
  );
  await owner.client.ventures.startBuying({ id: venture.id });

  const atMidnight = await as("owner", FIRST_OF_MAY);
  await atMidnight.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: cows.id,
    source: "born",
    aliases: [],
  });
  const manager = await as("manager", FIRST_OF_MAY);
  const farmsBull = await manager.client.intakes.record({
    penId: bulls.id,
    sex: "male",
    seller: { name: "ব্যাপারী" },
    purchasePriceMoney: 50_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(FIRST_OF_MAY),
    ...WINDOW,
  });
  await atMidnight.client.intakes.record({
    penId: bulls.id,
    sex: "male",
    seller: { name: "ব্যাপারী" },
    purchasePriceMoney: 50_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    ventureId: venture.id,
    ...PAID_FROM_THE_ACCOUNT,
    arrivedAt: new Date(FIRST_OF_MAY),
    ...WINDOW,
  });

  const storekeeper = await as("manager", "2046-05-02T04:00:00.000Z");
  const concentrate = await storekeeper.client.feed.items.create({
    name: { bn: "দানাদার" },
  });
  await storekeeper.client.stock.receive({
    feedItemId: concentrate.id,
    kind: "purchase",
    quantity: 1000,
    priceMoney: 40_000,
    seller: { name: "রহমান ফিডস" },
    receivedOn: "2046-05-02",
  });
  const vet = await as("vet", "2046-05-04T04:00:00.000Z");
  const wormer = await vet.client.drugs.create({
    name: { bn: "আলবেন্ডাজল", en: "Albendazole" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 14,
  });
  const buyingMedicine = await as("manager", "2046-05-04T04:00:00.000Z");
  await buyingMedicine.client.drugs.purchase({
    drugProductId: wormer.id,
    quantity: "১০ ডোজ",
    doses: 10,
    priceMoney: 5000,
    seller: { name: "ফার্মেসি" },
    purchasedOn: "2046-05-04",
    lotNumber: "ALB-1",
    expiresOn: "2047-05-04",
  });

  await spend({
    categoryId: category.rent ?? "",
    amountMoney: 8100,
    occurredOn: "2046-05-03",
  });
  await spend({
    categoryId: spray.id,
    amountMoney: 3000,
    occurredOn: "2046-05-05",
    side: "dairy",
  });
  const sending = await as("manager", "2046-05-10T04:00:00.000Z");
  await sending.client.milk.dispatch({
    dispatchedAt: new Date("2046-05-10T02:30:00.000Z"),
    liters: 100,
    pricePerLiterMoney: 60,
    paidNowMoney: 0,
    promisedBy: "2046-05-25",
    buyer: {
      name: "মিল্ক ভিটা",
      address: "বাঘাবাড়ী, শাহজাদপুর, সিরাজগঞ্জ",
      phone: "01711222335",
    },
  });
  const selling = await as("manager", "2046-05-19T18:00:00.000Z");
  await selling.client.sales.record({
    tagNumber: farmsBull.tagNumber,
    buyer: {
      name: "কাদের কসাই",
      address: "গাবতলী, ঢাকা",
      phone: "+8801711000057",
    },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৫",
    driver: "সোহেল",
    priceMoney: 80_000,
    weightKg: 260,
    paidNowMoney: 50_000,
    promisedBy: "2046-06-05",
  });
  const paying = await as("manager", "2046-06-03T04:00:00.000Z");
  await paying.client.receivables.pay({
    buyer: "মিল্ক ভিটা",
    kind: "milk",
    amountMoney: 3000,
    paidOn: "2046-06-03",
    paymentMethod: "cash",
  });
});

describe("what each Side came to in May", () => {
  it("is what it brought in less its charges, then its share of the rent by the days its own animals stood", async () => {
    const { client: owner } = await as("owner", NOW);
    const { figures } = await owner.monthlyReport.month({ month: "2046-05" });

    // The heifer's 31 days bear ৳3,100 of the rent, the Farm's bull's 19 days ৳1,900.
    expect(figures.results.dairy).toEqual({
      broughtInMoney: 6000,
      beforeOverheadsMoney: 3000,
      overheadsMoney: 3100,
      afterOverheadsMoney: -100,
      marginBeforePercent: 50,
      marginAfterPercent: -1.7,
    });
    expect(figures.results.fattening).toEqual({
      broughtInMoney: 80_000,
      beforeOverheadsMoney: 30_000,
      overheadsMoney: 1900,
      afterOverheadsMoney: 28_100,
      marginBeforePercent: 37.5,
      marginAfterPercent: 35.1,
    });
  });

  it("leaves the Venture's bull's days to the Farm, and the Farm's is both Sides less all the rent", async () => {
    const { client: owner } = await as("owner", NOW);
    const { figures } = await owner.monthlyReport.month({ month: "2046-05" });

    expect(figures.results.restOfOverheadsMoney).toBe(3100);
    expect(figures.results.farm).toEqual({
      broughtInMoney: 86_000,
      beforeOverheadsMoney: 33_000,
      overheadsMoney: 8100,
      afterOverheadsMoney: 24_900,
      marginBeforePercent: 38.4,
      marginAfterPercent: 29,
    });
  });
});

describe("what buyers owed at the end of May", () => {
  it("is by the days since each left, with what was overdue, and knows nothing of June's payment", async () => {
    const { client: owner } = await as("owner", NOW);
    const { figures } = await owner.monthlyReport.month({ month: "2046-05" });

    expect(figures.atEnd.receivables).toEqual({
      owingMoney: 36_000,
      overdueMoney: 6000,
      ages: [
        { age: "0-7", owingMoney: 0 },
        { age: "8-15", owingMoney: 30_000 },
        { age: "16-30", owingMoney: 6000 },
        { age: "31-60", owingMoney: 0 },
        { age: "over-60", owingMoney: 0 },
      ],
    });
  });

  it("reads a month still going to today", async () => {
    const { client: owner } = await as("owner", NOW);
    const { figures } = await owner.monthlyReport.month({ month: "2046-06" });

    // By 10 June the milk buyer has paid ৳3,000 of his ৳6,000, and the bull's buyer is five days past his promise.
    expect(figures.atEnd.receivables.owingMoney).toBe(33_000);
    expect(figures.atEnd.receivables.overdueMoney).toBe(33_000);
  });
});

describe("what the store was worth at the end of May", () => {
  it("is the feed at its average price and the medicine at its dose price, beside April's empty store", async () => {
    const { client: owner } = await as("owner", NOW);
    const { figures, figuresBefore } = await owner.monthlyReport.month({
      month: "2046-05",
    });

    expect(figures.atEnd.store).toEqual({
      feedMoney: 40_000,
      medicineMoney: 5000,
      totalMoney: 45_000,
      unpriced: 0,
    });
    expect(figuresBefore.atEnd.store.totalMoney).toBe(0);
  });
});
