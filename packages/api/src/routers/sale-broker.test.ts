import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A broker's fee for one Sale, typed on that Sale (CONTEXT.md, Selling Trip): the Farm pays it out as money of its own,
// and it is her cost — in her Margin, and in what a Venture repays the Farm for its selling.

const suffix = `sale-broker-${Date.now()}`;
const WINDOW = {
  targetWindowStart: "2070-06-17",
  targetWindowEnd: "2070-06-19",
};

let penId = "";
let ventureId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2070-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2070-03-02",
    unitPriceBdt: 50_000,
    units: 20,
    ...WINDOW,
  });
  // Capital in first: a bull at the gate is paid from what the account holds.
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 20, unitPriceBdt: 50_000 },
    `venture ${suffix}`,
    "2070-03-01"
  );
  await owner.client.ventures.startBuying({ id: venture.id });
  ventureId = venture.id;
});

const aBull = async (instant: string, ventureFor?: string) => {
  // A Venture's bull at the gate is the Owner's, paid from its account by bank.
  const manager = await as(ventureFor ? "owner" : "manager", instant);
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ventureId: ventureFor,
    ...(ventureFor ? PAID_FROM_THE_ACCOUNT : {}),
    ...WINDOW,
  });
};

const sell = async (tagNumber: string, brokerBdt?: number) => {
  const manager = await as("manager", "2070-03-20T06:00:00.000Z");
  await manager.client.sale.record({
    tagNumber,
    buyer: { name: `করিম ব্যাপারী ${suffix}`, phone: "+8801711000079" },
    weightKg: 330,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৭",
    driver: `চালক ${suffix}`,
    priceBdt: 120_000,
    ...(brokerBdt === undefined ? {} : { brokerBdt }),
  });
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true },
    with: { sale: { columns: { id: true } } },
  });
  return her?.sale?.id ?? "";
};

const brokerMoneyOf = async (saleId: string) =>
  await scratchDb().query.moneyEvent.findMany({
    where: { source: "sale_broker", sourceId: saleId },
    columns: { amountBdt: true, direction: true, purseVentureId: true },
  });

const herCosts = async (tagNumber: string) => {
  const owner = await as("owner", "2070-03-21T06:00:00.000Z");
  return await owner.client.costs.ofAnimal({ tagNumber });
};

describe("a broker's fee on a Sale", () => {
  it("is the Farm's money out, and her cost", async () => {
    const bull = await aBull("2070-03-02T04:00:00.000Z");
    const saleId = await sell(bull.tagNumber, 1500);
    expect(await brokerMoneyOf(saleId)).toEqual([
      { amountBdt: 1500, direction: "out", purseVentureId: null },
    ]);
    const costs = await herCosts(bull.tagNumber);
    expect(costs.tripBdt).toBe(1500);
  });

  it("books nothing where no broker was used", async () => {
    const bull = await aBull("2070-03-03T04:00:00.000Z");
    const saleId = await sell(bull.tagNumber);
    expect(await brokerMoneyOf(saleId)).toEqual([]);
    const costs = await herCosts(bull.tagNumber);
    expect(costs.tripBdt).toBe(0);
  });

  it("is put right by the Sale's Correction, its money with it", async () => {
    const bull = await aBull("2070-03-04T04:00:00.000Z");
    const saleId = await sell(bull.tagNumber, 1500);
    const manager = await as("manager", "2070-03-21T06:00:00.000Z");
    await manager.client.sale.correct({
      id: saleId,
      reason: `দালাল দুই হাজার নিয়েছিল ${suffix}`,
      changes: { brokerBdt: { from: 1500, to: 2000 } },
    });
    expect(await brokerMoneyOf(saleId)).toEqual([
      { amountBdt: 2000, direction: "out", purseVentureId: null },
    ]);
    const costs = await herCosts(bull.tagNumber);
    expect(costs.tripBdt).toBe(2000);
  });

  it("is repaid by a Venture for its own animal, named by her", async () => {
    const bull = await aBull("2070-03-05T04:00:00.000Z", ventureId);
    const saleId = await sell(bull.tagNumber, 1000);
    // The Farm paid the broker, as it pays the lorry.
    expect(await brokerMoneyOf(saleId)).toEqual([
      { amountBdt: 1000, direction: "out", purseVentureId: null },
    ]);
    const owner = await as("owner", "2070-04-02T06:00:00.000Z");
    const consumed = await owner.client.ventures.consumption({
      ventureId,
      month: "2070-03",
    });
    expect(consumed.tripsBdt).toBe(1000);
    expect(consumed.madeOf.trips).toEqual([
      {
        id: saleId,
        bdt: 1000,
        nameBn: `দালালি · ${bull.tagNumber}`,
        nameEn: `Broker · ${bull.tagNumber}`,
      },
    ]);
  });
});
