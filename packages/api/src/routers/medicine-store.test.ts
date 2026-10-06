import type { AlertKind } from "@OpenFarm/db/schema/alert";
import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The medicine on the shelf: the count wins, whatever is written afterwards about the days before it, and a dose
// comes out of a Lot that was there to take it from.

const suffix = `medicine-store-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let countId = "";
let tagNumber = "";

beforeAll(async () => {
  const owner = await as("owner", "2086-01-01T04:00:00.000Z");
  const made = await owner.client.sops.create({
    content: standardPlaybook().medicineCount,
  });
  countId = made.definitionId;
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গাভী পেন ${suffix}`,
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  ({ tagNumber } = cow);
});

const aProduct = async (name: string) => {
  const vet = await as("vet", "2086-01-01T04:00:00.000Z");
  const made = await vet.client.drugs.create({
    name: { bn: `${name} ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  return made.id;
};

const buy = async (
  drugProductId: string,
  purchasedOn: string,
  doses: number,
  lot?: { lotNumber: string; expiresOn: string }
) => {
  const manager = await as("manager", `${purchasedOn}T04:00:00.000Z`);
  await manager.client.drugs.purchase({
    drugProductId,
    quantity: `${doses} ডোজ`,
    doses,
    priceMoney: doses * 100,
    seller: { name: `ওষুধের দোকান ${suffix}` },
    purchasedOn,
    paymentMethod: "cash",
    ...lot,
  });
};

const give = async (
  productId: string,
  givenAt: string,
  recordedAt = givenAt
) => {
  const manager = await as("manager", recordedAt);
  await manager.client.treatments.giveNotPrescribed({
    animalTag: tagNumber,
    productId,
    givenAt: new Date(givenAt),
    advice: `জ্বর ${suffix}`,
  });
};

const stockOf = async (productId: string, instant: string) => {
  const owner = await as("owner", instant);
  const drugs = await owner.client.drugs.list();
  return drugs.find((one) => one.id === productId)?.stock;
};

/** The month's count on its Friday morning: every product as the book has it, but these. */
const count = async (
  day: string,
  found: Record<string, number>,
  lines?: { drugProductId: string; counted: number; reason?: string }[]
) => {
  const manager = await as("manager", `${day}T04:30:00.000Z`);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today();
  const work = today.find((row) => row.definitionId === countId);
  if (!work) {
    throw new Error("expected the monthly medicine count");
  }
  const shown = await manager.client.work.get({ id: work.id });
  const drugs = await manager.client.drugs.list();
  const onHand = new Map(drugs.map((one) => [one.id, one.stock.onHand]));
  await manager.client.work.claim({ id: work.id });
  return await manager.client.work.completeStep({
    instanceId: work.id,
    stepId: "count",
    evidence: [true],
    medicineCounts:
      lines ??
      (shown.medicineCount?.items ?? []).map((item) => ({
        drugProductId: item.drugProductId,
        counted:
          found[item.drugProductId] ?? onHand.get(item.drugProductId) ?? 0,
        reason: "গণনায় যা পাওয়া গেছে",
      })),
  });
};

const toldTo = async (role: "manager" | "vet", kind: AlertKind) => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind, userId: thePerson(role).id, farmId: theFarm().id },
    columns: { params: true },
  });
  return rows.map((one) => one.params as Record<string, unknown>);
};

describe("the medicine on the shelf", () => {
  it("is not taken twice for a dose given before a count but written down after it", async () => {
    const product = await aProduct("দেরিতে লেখা");
    await buy(product, "2086-01-10", 10);
    // On the shelf on the count's day: eight, two gone and one of them given on the 20th, not yet written down.
    await count("2086-02-01", { [product]: 8 });
    await give(product, "2086-01-20T04:00:00.000Z", "2086-02-05T04:00:00.000Z");
    const stock = await stockOf(product, "2086-02-06T04:00:00.000Z");
    expect(stock?.onHand).toBe(8);
  });

  it("holds doses a count found over the book", async () => {
    const product = await aProduct("পাওয়া বাক্স");
    await buy(product, "2086-02-10", 10);
    await count("2086-03-01", { [product]: 12 });
    const stock = await stockOf(product, "2086-03-02T04:00:00.000Z");
    expect(stock?.onHand).toBe(12);
  });

  it("takes a dose from a Lot already bought when it was given", async () => {
    const product = await aProduct("লটের ক্রম");
    await buy(product, "2086-03-10", 10, {
      lotNumber: "LONG",
      expiresOn: "2099-01-01",
    });
    await give(product, "2086-03-12T04:00:00.000Z");
    await buy(product, "2086-03-20", 10, {
      lotNumber: "SHORT",
      expiresOn: "2098-12-31",
    });
    const stock = await stockOf(product, "2086-03-21T04:00:00.000Z");
    expect(stock?.lots.map((one) => [one.lotNumber, one.left])).toEqual([
      ["SHORT", 10],
      ["LONG", 9],
    ]);
  });

  it("does not warn of an expired Lot the count wrote off", async () => {
    const product = await aProduct("মেয়াদ ফেলা");
    await buy(product, "2086-04-01", 10, {
      lotNumber: "OUT-1",
      expiresOn: "2086-04-20",
    });
    await buy(product, "2086-04-01", 10, {
      lotNumber: "IN-1",
      expiresOn: "2087-04-30",
    });
    // The ten past their day thrown out at the count.
    await count("2086-05-03", { [product]: 10 });
    await give(product, "2086-05-10T04:00:00.000Z");
    const told = await toldTo("vet", "expired_dose_given");
    expect(told.filter((one) => one.lotNumber === "OUT-1")).toEqual([]);
  });

  it("is counted once a product", async () => {
    const product = await aProduct("দুবার গোনা");
    const manager = await as("manager", "2086-06-01T04:00:00.000Z");
    const drugs = await manager.client.drugs.list();
    const lines = drugs
      .filter((one) => !one.retiredAt)
      .map((one) => ({ drugProductId: one.id, counted: one.stock.onHand }));
    await expect(
      count("2086-06-07", {}, [
        ...lines,
        { drugProductId: product, counted: 3, reason: "আবার গোনা" },
      ])
    ).rejects.toMatchObject({ data: { refusal: "counted_twice" } });
  });
});

describe("a box bought on a count's day", () => {
  it("is kept when it came after the morning's count", async () => {
    const product = await aProduct("বিকেলের বাক্স");
    await buy(product, "2086-07-20", 10);
    await count("2086-08-02", {});
    // Four in the afternoon on the count's day: ten more.
    const manager = await as("manager", "2086-08-02T10:00:00.000Z");
    await manager.client.drugs.purchase({
      drugProductId: product,
      quantity: "১০ ডোজ",
      doses: 10,
      priceMoney: 1000,
      seller: { name: `ওষুধের দোকান ${suffix}` },
      purchasedOn: "2086-08-02",
      paymentMethod: "cash",
    });
    const stock = await stockOf(product, "2086-08-02T11:00:00.000Z");
    expect(stock?.onHand).toBe(20);
  });
});

describe("a Medicine Purchase put right", () => {
  it("puts the store, and the money it paid, right with it", async () => {
    const product = await aProduct("ভুল লেখা");
    const manager = await as("manager", "2086-07-10T04:00:00.000Z");
    // A hundred doses for ৳10,000 typed; ten for ৳1,000 bought.
    const bought = await manager.client.drugs.purchase({
      drugProductId: product,
      quantity: "১০০ ডোজ",
      doses: 100,
      priceMoney: 10_000,
      seller: { name: `ওষুধের দোকান ${suffix}` },
      purchasedOn: "2086-07-10",
      paymentMethod: "cash",
    });
    await manager.client.drugs.correctPurchase({
      id: bought.id,
      reason: "শূন্য বেশি লেখা হয়েছিল",
      changes: {
        doses: { from: 100, to: 10 },
        priceMoney: { from: 10_000, to: 1000 },
      },
    });

    const stock = await stockOf(product, "2086-07-11T04:00:00.000Z");
    expect(stock).toMatchObject({ dosesIn: 10, onHand: 10 });
    const paid = await scratchDb().query.moneyEvent.findFirst({
      where: { source: "medicine_purchase", sourceId: bought.id },
      columns: { amountMoney: true },
    });
    expect(paid?.amountMoney).toBe(1000);
  });
});
