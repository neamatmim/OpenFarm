import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Receivable at the gate: a buyer who takes a bull or the milk and pays part of it, or none, now. Only what was paid is money
 * that day; what he still owes, and the day he promised to pay it by, stay on the Sale or the Dispatch. A Venture's
 * animal leaves paid in full.
 */
const suffix = `receivable-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const PERIOD = { from: "2048-03-01", to: "2048-03-31" };
const WINDOW = {
  targetWindowStart: "2048-06-17",
  targetWindowEnd: "2048-06-19",
};

let penId = "";
let ventureId = "";
/** The Venture's bulls, all bought before any is sold: its first Sale starts it Selling, and a Venture that is
 *  selling takes no more animals. */
const ventureBulls: { tagNumber: string; intakeId: string }[] = [];

/** One bull off the lorry, for the Farm or for a Venture. */
const buy = async (instant: string, ventureFor?: string) => {
  // A Venture's bull at the gate is the Owner's, paid from its account by bank.
  const manager = await as(ventureFor ? "owner" : "manager", instant);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ventureId: ventureFor,
    ...(ventureFor ? PAID_FROM_THE_ACCOUNT : {}),
    ...WINDOW,
  });
};

const aTrader = {
  buyer: { name: `করিম ব্যাপারী ${suffix}`, phone: "+8801711000077" },
  weightKg: 330,
  destination: `গাবতলী ${suffix}`,
  vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৫",
  driver: `চালক ${suffix}`,
};

/** The Money Events a record booked, in the Farm's own register. */
const bookedFor = async (sourceId: string) => {
  const owner = await as("owner", "2048-03-31T12:00:00.000Z");
  const money = await owner.client.money.list(PERIOD);
  return money.events.filter((one) => one.sourceId === sourceId);
};

const saleRow = async (id: string) =>
  await scratchDb().query.sale.findFirst({
    where: { id },
    columns: { priceMoney: true, receivableMoney: true, promisedBy: true },
  });

beforeAll(async () => {
  const owner = await as("owner", "2048-03-01T04:00:00.000Z");
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2048-03-02",
    unitPriceMoney: 50_000,
    units: 20,
    ...WINDOW,
  });
  // Capital in first: a bull at the gate is paid from what the account holds.
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 20, unitPriceMoney: 50_000 },
    `venture ${suffix}`,
    "2048-03-01"
  );
  await owner.client.ventures.startBuying({ id: venture.id });
  ventureId = venture.id;
  ventureBulls.push(
    await buy("2048-03-02T05:00:00.000Z", ventureId),
    await buy("2048-03-02T05:10:00.000Z", ventureId)
  );
});

const ventureBull = (index: number) => {
  const bull = ventureBulls[index];
  if (!bull) {
    throw new Error(`expected the Venture's bull ${index}`);
  }
  return bull;
};

describe("a bull sold on credit", () => {
  it("books only what the buyer paid, and keeps what he owes on the Sale", async () => {
    const bull = await buy("2048-03-02T04:00:00.000Z");
    const manager = await as("manager", "2048-03-10T06:00:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 120_000,
      paidNowMoney: 100_000,
      promisedBy: "2048-03-17",
    });
    expect(await saleRow(sold.id)).toEqual({
      priceMoney: 120_000,
      receivableMoney: 20_000,
      promisedBy: "2048-03-17",
    });
    const booked = await bookedFor(sold.id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountMoney: 100_000, direction: "in" });
  });

  it("books nothing when he took her all on credit", async () => {
    const bull = await buy("2048-03-02T04:10:00.000Z");
    const manager = await as("manager", "2048-03-10T06:10:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 110_000,
      paidNowMoney: 0,
      promisedBy: "2048-03-20",
    });
    expect(await saleRow(sold.id)).toMatchObject({ receivableMoney: 110_000 });
    expect(await bookedFor(sold.id)).toHaveLength(0);
  });

  it("is paid in full when nothing is said of what he paid, as every Sale was before", async () => {
    const bull = await buy("2048-03-02T04:20:00.000Z");
    const manager = await as("manager", "2048-03-10T06:20:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 115_000,
    });
    expect(await saleRow(sold.id)).toEqual({
      priceMoney: 115_000,
      receivableMoney: 0,
      promisedBy: null,
    });
    const [booked] = await bookedFor(sold.id);
    expect(booked).toMatchObject({ amountMoney: 115_000 });
  });

  it("refuses more paid than the price, a Receivable with no promise, and a promise before she left", async () => {
    const bull = await buy("2048-03-02T04:30:00.000Z");
    const manager = await as("manager", "2048-03-10T06:30:00.000Z");
    const sell = (more: { paidNowMoney?: number; promisedBy?: string }) =>
      manager.client.sales.record({
        tagNumber: bull.tagNumber,
        ...aTrader,
        priceMoney: 100_000,
        ...more,
      });
    await expect(sell({ paidNowMoney: 100_001 })).rejects.toMatchObject({
      data: { refusal: "paid_more_than_price" },
    });
    await expect(sell({ paidNowMoney: 50_000 })).rejects.toMatchObject({
      data: { refusal: "receivable_needs_a_promise" },
    });
    await expect(
      sell({ paidNowMoney: 50_000, promisedBy: "2048-03-09" })
    ).rejects.toMatchObject({
      data: { refusal: "promise_before_it_left" },
    });
    // Refused, not half-written: she is still here to be sold properly.
    const her = await manager.client.animals.get({
      tagNumber: bull.tagNumber,
    });
    expect(her.state).not.toBe("sold");
  });
});

describe("a Venture's bull", () => {
  it("leaves paid in full, and is refused with anything owing", async () => {
    const bull = ventureBull(0);
    const manager = await as("manager", "2048-03-11T06:00:00.000Z");
    await expect(
      manager.client.sales.record({
        tagNumber: bull.tagNumber,
        ...aTrader,
        priceMoney: 125_000,
        paidNowMoney: 100_000,
        promisedBy: "2048-03-18",
      })
    ).rejects.toMatchObject({ data: { refusal: "venture_paid_in_full" } });
    const her = await manager.client.animals.get({
      tagNumber: bull.tagNumber,
    });
    expect(her.state).not.toBe("sold");

    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 125_000,
      paidNowMoney: 125_000,
    });
    expect(await saleRow(sold.id)).toMatchObject({ receivableMoney: 0 });
  });

  it("is refused a Correction that would leave her buyer owing", async () => {
    const bull = ventureBull(1);
    const manager = await as("manager", "2048-03-11T06:10:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 118_000,
    });
    await expect(
      manager.client.sales.correct({
        id: sold.id,
        reason: "পুরো টাকা দেয়নি",
        changes: {
          paidNowMoney: { from: 118_000, to: 90_000 },
          promisedBy: { from: null, to: "2048-03-20" },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "venture_paid_in_full" } });
    expect(await saleRow(sold.id)).toMatchObject({ receivableMoney: 0 });
  });

  it("will not take a Farm bull sold on credit as hers after the fact", async () => {
    const bull = await buy("2048-03-02T05:20:00.000Z");
    const manager = await as("manager", "2048-03-11T06:20:00.000Z");
    await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 100_000,
      paidNowMoney: 60_000,
      promisedBy: "2048-03-25",
    });
    // The Owner's to make her a Venture's, paid from its account by bank: even so, a bull already sold on credit is not
    // taken.
    const owner = await as("owner", "2048-03-11T06:30:00.000Z");
    await expect(
      owner.client.intakes.correct({
        id: bull.intakeId,
        reason: "ভেঞ্চারের গরু ছিল",
        changes: {
          owner: { from: null, to: ventureId },
          paymentMethod: { from: "cash", to: "bank" },
          reference: { from: null, to: "TRF ভেঞ্চারের হিসাব থেকে" },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "venture_paid_in_full" } });
  });
});

describe("a Sale put right", () => {
  it("keeps what a part-paying buyer paid when the price is put right, in the same Money Event", async () => {
    const bull = await buy("2048-03-02T06:00:00.000Z");
    const manager = await as("manager", "2048-03-12T06:00:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 120_000,
      paidNowMoney: 100_000,
      promisedBy: "2048-03-19",
    });
    await manager.client.sales.correct({
      id: sold.id,
      reason: "দাম ভুল লেখা হয়েছিল",
      changes: { priceMoney: { from: 120_000, to: 125_000 } },
    });
    expect(await saleRow(sold.id)).toEqual({
      priceMoney: 125_000,
      receivableMoney: 25_000,
      promisedBy: "2048-03-19",
    });
    const booked = await bookedFor(sold.id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountMoney: 100_000 });

    await manager.client.sales.correct({
      id: sold.id,
      reason: "সেদিন আরো দশ হাজার দিয়েছিল",
      changes: { paidNowMoney: { from: 100_000, to: 110_000 } },
    });
    expect(await saleRow(sold.id)).toMatchObject({ receivableMoney: 15_000 });
    const after = await bookedFor(sold.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ amountMoney: 110_000 });
  });

  it("keeps a buyer who paid in full paid in full at a corrected price", async () => {
    const bull = await buy("2048-03-02T06:10:00.000Z");
    const manager = await as("manager", "2048-03-12T06:10:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceMoney: 100_000,
    });
    await manager.client.sales.correct({
      id: sold.id,
      reason: "দাম ভুল লেখা হয়েছিল",
      changes: { priceMoney: { from: 100_000, to: 105_000 } },
    });
    expect(await saleRow(sold.id)).toMatchObject({ receivableMoney: 0 });
    const [booked] = await bookedFor(sold.id);
    expect(booked).toMatchObject({ amountMoney: 105_000 });
  });
});

describe("the receipt", () => {
  it("says what he paid, what he still owes, and the day he promised", async () => {
    const buyer = { name: `রসিদের ক্রেতা ${suffix}` };
    const first = await buy("2048-03-02T07:00:00.000Z");
    const second = await buy("2048-03-02T07:10:00.000Z");
    const manager = await as("manager", "2048-03-14T06:00:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: first.tagNumber,
      ...aTrader,
      buyer,
      priceMoney: 100_000,
      paidNowMoney: 70_000,
      promisedBy: "2048-03-21",
    });
    await manager.client.sales.record({
      tagNumber: second.tagNumber,
      ...aTrader,
      buyer,
      priceMoney: 90_000,
    });
    const owner = await as("owner", "2048-03-14T07:00:00.000Z");
    await owner.client.language.set({ language: "en" });
    const receipt = await owner.client.papers.receipt({ saleId: sold.id });
    expect(receipt.text).toContain("Total: 190,000");
    expect(receipt.text).toContain("Paid: 160,000");
    expect(receipt.text).toContain("Still owed: 30,000");
    expect(receipt.text).toMatch(/To be paid by: .*21/u);
  });

  it("says nothing of Receivable to a buyer who paid in full", async () => {
    const bull = await buy("2048-03-02T07:20:00.000Z");
    const manager = await as("manager", "2048-03-14T08:00:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      buyer: { name: `নগদের ক্রেতা ${suffix}` },
      priceMoney: 100_000,
    });
    const receipt = await manager.client.papers.receipt({ saleId: sold.id });
    expect(receipt.text).not.toContain("Still owed");
  });
});

describe("milk on credit", () => {
  const milkBuyer = { name: `মিষ্টির দোকান ${suffix}`, address: "উল্লাপাড়া" };

  it("books what the milk buyer paid, and takes Receivable with no promised day", async () => {
    const manager = await as("manager", "2048-03-15T03:00:00.000Z");
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2048-03-15T02:00:00.000Z"),
      litres: 45.5,
      buyer: milkBuyer,
      pricePerLitreMoney: 68,
      paidNowMoney: 3000,
    });
    const row = await scratchDb().query.dispatch.findFirst({
      where: { id: recorded.id },
      columns: { receivableMoney: true, promisedBy: true },
    });
    // 45.5 litres at 68 comes to 3094.
    expect(row).toEqual({ receivableMoney: 94, promisedBy: null });
    const booked = await bookedFor(recorded.id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountMoney: 3000 });
  });

  it("keeps what he paid when the litres are put right, and books nothing for milk taken all on credit", async () => {
    const manager = await as("manager", "2048-03-16T03:00:00.000Z");
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2048-03-16T02:00:00.000Z"),
      litres: 40,
      buyer: milkBuyer,
      pricePerLitreMoney: 70,
      paidNowMoney: 2000,
    });
    await manager.client.milk.correctDispatch({
      id: recorded.id,
      reason: "মাপার সময় ভুল পড়া হয়েছিল",
      changes: { litres: { from: 40, to: 42 } },
    });
    const row = await scratchDb().query.dispatch.findFirst({
      where: { id: recorded.id },
      columns: { receivableMoney: true },
    });
    expect(row).toEqual({ receivableMoney: 940 });
    const [booked] = await bookedFor(recorded.id);
    expect(booked).toMatchObject({ amountMoney: 2000 });

    const onCredit = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2048-03-16T02:30:00.000Z"),
      litres: 20,
      buyer: milkBuyer,
      pricePerLitreMoney: 70,
      paidNowMoney: 0,
    });
    expect(await bookedFor(onCredit.id)).toHaveLength(0);
  });

  it("refuses more paid than the milk came to", async () => {
    const manager = await as("manager", "2048-03-17T03:00:00.000Z");
    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2048-03-17T02:00:00.000Z"),
        litres: 10,
        buyer: milkBuyer,
        pricePerLitreMoney: 70,
        paidNowMoney: 701,
      })
    ).rejects.toMatchObject({ data: { refusal: "paid_more_than_price" } });
  });
});
