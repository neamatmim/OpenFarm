import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Baki at the gate: a buyer who takes a bull or the milk and pays part of it, or none, now. Only what was paid is money
 * that day; what he still owes, and the day he promised to pay it by, stay on the Sale or the Dispatch. A Venture's
 * animal leaves paid in full.
 */
const suffix = `baki-${Date.now()}`;

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
  const manager = await as("manager", instant);
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ventureId: ventureFor,
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
    columns: { priceBdt: true, bakiBdt: true, promisedBy: true },
  });

beforeAll(async () => {
  const owner = await as("owner", "2048-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2048-03-02",
    unitPriceBdt: 50_000,
    units: 20,
    ...WINDOW,
  });
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

describe("a bull sold on Baki", () => {
  it("books only what the buyer paid, and keeps what he owes on the Sale", async () => {
    const bull = await buy("2048-03-02T04:00:00.000Z");
    const manager = await as("manager", "2048-03-10T06:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 120_000,
      paidNowBdt: 100_000,
      promisedBy: "2048-03-17",
    });
    expect(await saleRow(sold.id)).toEqual({
      priceBdt: 120_000,
      bakiBdt: 20_000,
      promisedBy: "2048-03-17",
    });
    const booked = await bookedFor(sold.id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountBdt: 100_000, direction: "in" });
  });

  it("books nothing when he took her all on Baki", async () => {
    const bull = await buy("2048-03-02T04:10:00.000Z");
    const manager = await as("manager", "2048-03-10T06:10:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 110_000,
      paidNowBdt: 0,
      promisedBy: "2048-03-20",
    });
    expect(await saleRow(sold.id)).toMatchObject({ bakiBdt: 110_000 });
    expect(await bookedFor(sold.id)).toHaveLength(0);
  });

  it("is paid in full when nothing is said of what he paid, as every Sale was before", async () => {
    const bull = await buy("2048-03-02T04:20:00.000Z");
    const manager = await as("manager", "2048-03-10T06:20:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 115_000,
    });
    expect(await saleRow(sold.id)).toEqual({
      priceBdt: 115_000,
      bakiBdt: 0,
      promisedBy: null,
    });
    const [booked] = await bookedFor(sold.id);
    expect(booked).toMatchObject({ amountBdt: 115_000 });
  });

  it("refuses more paid than the price, a Baki with no promise, and a promise before she left", async () => {
    const bull = await buy("2048-03-02T04:30:00.000Z");
    const manager = await as("manager", "2048-03-10T06:30:00.000Z");
    const sell = (more: { paidNowBdt?: number; promisedBy?: string }) =>
      manager.client.sale.record({
        tagNumber: bull.tagNumber,
        ...aTrader,
        priceBdt: 100_000,
        ...more,
      });
    await expect(sell({ paidNowBdt: 100_001 })).rejects.toMatchObject({
      data: { refusal: "paid_more_than_price" },
    });
    await expect(sell({ paidNowBdt: 50_000 })).rejects.toMatchObject({
      data: { refusal: "baki_needs_a_promise" },
    });
    await expect(
      sell({ paidNowBdt: 50_000, promisedBy: "2048-03-09" })
    ).rejects.toMatchObject({
      data: { refusal: "promise_before_it_left" },
    });
    // Refused, not half-written: she is still here to be sold properly.
    const her = await manager.client.animals.byTag({
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
      manager.client.sale.record({
        tagNumber: bull.tagNumber,
        ...aTrader,
        priceBdt: 125_000,
        paidNowBdt: 100_000,
        promisedBy: "2048-03-18",
      })
    ).rejects.toMatchObject({ data: { refusal: "venture_paid_in_full" } });
    const her = await manager.client.animals.byTag({
      tagNumber: bull.tagNumber,
    });
    expect(her.state).not.toBe("sold");

    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 125_000,
      paidNowBdt: 125_000,
    });
    expect(await saleRow(sold.id)).toMatchObject({ bakiBdt: 0 });
  });

  it("is refused a Correction that would leave her buyer owing", async () => {
    const bull = ventureBull(1);
    const manager = await as("manager", "2048-03-11T06:10:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 118_000,
    });
    await expect(
      manager.client.sale.correct({
        id: sold.id,
        reason: "পুরো টাকা দেয়নি",
        changes: {
          paidNowBdt: { from: 118_000, to: 90_000 },
          promisedBy: { from: null, to: "2048-03-20" },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "venture_paid_in_full" } });
    expect(await saleRow(sold.id)).toMatchObject({ bakiBdt: 0 });
  });

  it("will not take a Farm bull sold on Baki as hers after the fact", async () => {
    const bull = await buy("2048-03-02T05:20:00.000Z");
    const manager = await as("manager", "2048-03-11T06:20:00.000Z");
    await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 100_000,
      paidNowBdt: 60_000,
      promisedBy: "2048-03-25",
    });
    await expect(
      manager.client.intake.correct({
        id: bull.intakeId,
        reason: "ভেঞ্চারের গরু ছিল",
        changes: { owner: { from: null, to: ventureId } },
      })
    ).rejects.toMatchObject({ data: { refusal: "venture_paid_in_full" } });
  });
});

describe("a Sale put right", () => {
  it("keeps what a part-paying buyer paid when the price is put right, in the same Money Event", async () => {
    const bull = await buy("2048-03-02T06:00:00.000Z");
    const manager = await as("manager", "2048-03-12T06:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 120_000,
      paidNowBdt: 100_000,
      promisedBy: "2048-03-19",
    });
    await manager.client.sale.correct({
      id: sold.id,
      reason: "দাম ভুল লেখা হয়েছিল",
      changes: { priceBdt: { from: 120_000, to: 125_000 } },
    });
    expect(await saleRow(sold.id)).toEqual({
      priceBdt: 125_000,
      bakiBdt: 25_000,
      promisedBy: "2048-03-19",
    });
    const booked = await bookedFor(sold.id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountBdt: 100_000 });

    await manager.client.sale.correct({
      id: sold.id,
      reason: "সেদিন আরো দশ হাজার দিয়েছিল",
      changes: { paidNowBdt: { from: 100_000, to: 110_000 } },
    });
    expect(await saleRow(sold.id)).toMatchObject({ bakiBdt: 15_000 });
    const after = await bookedFor(sold.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ amountBdt: 110_000 });
  });

  it("keeps a buyer who paid in full paid in full at a corrected price", async () => {
    const bull = await buy("2048-03-02T06:10:00.000Z");
    const manager = await as("manager", "2048-03-12T06:10:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      priceBdt: 100_000,
    });
    await manager.client.sale.correct({
      id: sold.id,
      reason: "দাম ভুল লেখা হয়েছিল",
      changes: { priceBdt: { from: 100_000, to: 105_000 } },
    });
    expect(await saleRow(sold.id)).toMatchObject({ bakiBdt: 0 });
    const [booked] = await bookedFor(sold.id);
    expect(booked).toMatchObject({ amountBdt: 105_000 });
  });
});

describe("the receipt", () => {
  it("says what he paid, what he still owes, and the day he promised", async () => {
    const buyer = { name: `রসিদের ক্রেতা ${suffix}` };
    const first = await buy("2048-03-02T07:00:00.000Z");
    const second = await buy("2048-03-02T07:10:00.000Z");
    const manager = await as("manager", "2048-03-14T06:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: first.tagNumber,
      ...aTrader,
      buyer,
      priceBdt: 100_000,
      paidNowBdt: 70_000,
      promisedBy: "2048-03-21",
    });
    await manager.client.sale.record({
      tagNumber: second.tagNumber,
      ...aTrader,
      buyer,
      priceBdt: 90_000,
    });
    const owner = await as("owner", "2048-03-14T07:00:00.000Z");
    await owner.client.language.set({ language: "en" });
    const receipt = await owner.client.papers.receipt({ saleId: sold.id });
    expect(receipt.text).toContain("Total: 190,000");
    expect(receipt.text).toContain("Paid: 160,000");
    expect(receipt.text).toContain("Still owed: 30,000");
    expect(receipt.text).toMatch(/To be paid by: .*21/u);
  });

  it("says nothing of Baki to a buyer who paid in full", async () => {
    const bull = await buy("2048-03-02T07:20:00.000Z");
    const manager = await as("manager", "2048-03-14T08:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      ...aTrader,
      buyer: { name: `নগদের ক্রেতা ${suffix}` },
      priceBdt: 100_000,
    });
    const receipt = await manager.client.papers.receipt({ saleId: sold.id });
    expect(receipt.text).not.toContain("Still owed");
  });
});

describe("milk on Baki", () => {
  const milkBuyer = { name: `মিষ্টির দোকান ${suffix}`, address: "উল্লাপাড়া" };

  it("books what the milk buyer paid, and takes Baki with no promised day", async () => {
    const manager = await as("manager", "2048-03-15T03:00:00.000Z");
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2048-03-15T02:00:00.000Z"),
      litres: 45.5,
      buyer: milkBuyer,
      pricePerLitreBdt: 68,
      paidNowBdt: 3000,
    });
    const row = await scratchDb().query.dispatch.findFirst({
      where: { id: recorded.id },
      columns: { bakiBdt: true, promisedBy: true },
    });
    // 45.5 litres at 68 comes to 3094.
    expect(row).toEqual({ bakiBdt: 94, promisedBy: null });
    const booked = await bookedFor(recorded.id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountBdt: 3000 });
  });

  it("keeps what he paid when the litres are put right, and books nothing for milk taken all on Baki", async () => {
    const manager = await as("manager", "2048-03-16T03:00:00.000Z");
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2048-03-16T02:00:00.000Z"),
      litres: 40,
      buyer: milkBuyer,
      pricePerLitreBdt: 70,
      paidNowBdt: 2000,
    });
    await manager.client.milk.correctDispatch({
      id: recorded.id,
      reason: "মাপার সময় ভুল পড়া হয়েছিল",
      changes: { litres: { from: 40, to: 42 } },
    });
    const row = await scratchDb().query.dispatch.findFirst({
      where: { id: recorded.id },
      columns: { bakiBdt: true },
    });
    expect(row).toEqual({ bakiBdt: 940 });
    const [booked] = await bookedFor(recorded.id);
    expect(booked).toMatchObject({ amountBdt: 2000 });

    const onBaki = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2048-03-16T02:30:00.000Z"),
      litres: 20,
      buyer: milkBuyer,
      pricePerLitreBdt: 70,
      paidNowBdt: 0,
    });
    expect(await bookedFor(onBaki.id)).toHaveLength(0);
  });

  it("refuses more paid than the milk came to", async () => {
    const manager = await as("manager", "2048-03-17T03:00:00.000Z");
    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2048-03-17T02:00:00.000Z"),
        litres: 10,
        buyer: milkBuyer,
        pricePerLitreBdt: 70,
        paidNowBdt: 701,
      })
    ).rejects.toMatchObject({ data: { refusal: "paid_more_than_price" } });
  });
});
