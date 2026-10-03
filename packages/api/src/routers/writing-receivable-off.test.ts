import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Writing Receivable off: the Owner closing what a buyer will not pay, with a reason. What the animal — or a litre of milk —
 * fetched is then its price less it, in every figure that asks; the buyer carries the mark; and a buyer who pays after
 * all puts it back.
 */
const suffix = `off-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const WINDOW = {
  targetWindowStart: "2051-08-17",
  targetWindowEnd: "2051-08-19",
};
const TRADER = `পালানো ব্যাপারী ${suffix}`;
const SHOP = `বন্ধ দোকান ${suffix}`;

let penId = "";
let saleId = "";
let tagNumber = "";
let dispatchId = "";
let writeOffId = "";

beforeAll(async () => {
  const owner = await as("owner", "2051-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const manager = await as("manager", "2051-03-02T05:00:00.000Z");
  const bull = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2051-03-02T05:00:00.000Z"),
    ...WINDOW,
  });
  ({ tagNumber } = bull);
  const sold = await manager.client.sale.record({
    tagNumber,
    buyer: { name: TRADER },
    priceMoney: 120_000,
    paidNowMoney: 100_000,
    promisedBy: "2051-03-09",
    weightKg: 330,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ট্রাক",
    driver: `চালক ${suffix}`,
  });
  saleId = sold.id;
  // A hundred litres at seventy, none of it paid for.
  const dairy = await as("manager", "2051-03-03T04:00:00.000Z");
  const milk = await dairy.client.milk.dispatch({
    dispatchedAt: new Date("2051-03-03T03:00:00.000Z"),
    litres: 100,
    buyer: { name: SHOP },
    pricePerLitreMoney: 70,
    paidNowMoney: 0,
  });
  dispatchId = milk.id;
});

const herSale = async () => {
  const owner = await as("owner", "2051-03-31T12:00:00.000Z");
  return await owner.client.costs.ofAnimal({ tagNumber });
};

const march = async () => {
  const owner = await as("owner", "2051-03-31T12:00:00.000Z");
  const { months } = await owner.client.home.byMonth();
  return months.find((one) => one.month === "2051-03");
};

describe("writing Receivable off", () => {
  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2051-03-20T06:00:00.000Z");
    await expect(
      manager.client.receivable.writeOff({
        source: "sale",
        id: saleId,
        amountMoney: 20_000,
        why: "পালিয়ে গেছে",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is refused above what is still owed", async () => {
    const owner = await as("owner", "2051-03-20T06:00:00.000Z");
    await expect(
      owner.client.receivable.writeOff({
        source: "sale",
        id: saleId,
        amountMoney: 20_001,
        why: "পালিয়ে গেছে",
      })
    ).rejects.toMatchObject({
      data: { refusal: "written_off_more_than_owed", owingMoney: 20_000 },
    });
  });

  it("lowers what she fetched, and her Margin with it, by what was written off", async () => {
    const before = await herSale();
    const owner = await as("owner", "2051-03-20T06:00:00.000Z");
    ({ id: writeOffId } = await owner.client.receivable.writeOff({
      source: "sale",
      id: saleId,
      amountMoney: 20_000,
      why: "ব্যাপারী আর ফোন ধরে না, এলাকা ছেড়েছে",
    }));
    const after = await herSale();
    expect(before.saleMoney).toBe(120_000);
    expect(after.saleMoney).toBe(100_000);
    expect((before.marginMoney ?? 0) - (after.marginMoney ?? 0)).toBe(20_000);
  });

  it("marks the buyer: the sheets say what was written off, and he owes nothing more", async () => {
    const manager = await as("manager", "2051-03-21T06:00:00.000Z");
    const his = await manager.client.receivable.ofBuyer({ name: TRADER });
    expect(his).toMatchObject({
      owingMoney: 0,
      writtenOffMoney: 20_000,
      lastWrittenOffOn: "2051-03-20",
    });
    // Still listed, apart, for what was written off.
    const list = await manager.client.receivable.list();
    expect(list.find((one) => one.name === TRADER)).toMatchObject({
      writtenOffMoney: 20_000,
    });
    // Each write-off listed under what it was written off of, by its own id, which is what the Owner puts right.
    const items = list
      .find((one) => one.name === TRADER)
      ?.kinds.flatMap((kind) => kind.items);
    expect(items?.find((one) => one.id === saleId)?.writeOffs).toEqual([
      {
        id: writeOffId,
        amountMoney: 20_000,
        reason: "ব্যাপারী আর ফোন ধরে না, এলাকা ছেড়েছে",
        writtenOn: "2051-03-20",
      },
    ]);
  });

  it("is put back by a buyer who pays after all", async () => {
    const manager = await as("manager", "2051-03-22T06:00:00.000Z");
    await manager.client.receivable.pay({
      buyer: TRADER,
      kind: "cattle",
      amountMoney: 5000,
      paidOn: "2051-03-22",
      paymentMethod: "cash",
      note: "হঠাৎ এসে পাঁচ হাজার দিয়ে গেলেন",
    });
    const after = await herSale();
    expect(after.saleMoney).toBe(105_000);
    const his = await manager.client.receivable.ofBuyer({ name: TRADER });
    expect(his?.writtenOffMoney).toBe(15_000);
  });

  it("is taken back whole by the Owner as a Correction, and he owes again what stays unpaid", async () => {
    const owner = await as("owner", "2051-03-23T06:00:00.000Z");
    await owner.client.receivable.correctWriteOff({
      id: writeOffId,
      reason: "ভুল করে লেখা হয়েছিল, ব্যাপারী টাকা দেবেন বলেছেন",
      changes: { amountMoney: { from: 20_000, to: 0 } },
    });
    const after = await herSale();
    expect(after.saleMoney).toBe(120_000);
    const his = await owner.client.receivable.ofBuyer({ name: TRADER });
    expect(his).toMatchObject({ owingMoney: 15_000, writtenOffMoney: 0 });
  });

  it("lowers what a litre fetched when milk is written off", async () => {
    const before = await march();
    expect(before?.dairy).toMatchObject({ fetchedPerLitreMoney: 70 });
    const owner = await as("owner", "2051-03-25T06:00:00.000Z");
    await owner.client.receivable.writeOff({
      source: "dispatch",
      id: dispatchId,
      amountMoney: 7000,
      why: "দোকান বন্ধ হয়ে গেছে",
    });
    const after = await march();
    // The milk still left the farm: its litres stand, and fetched nothing.
    expect(after?.dairy).toMatchObject({
      milkSoldMoney: 0,
      fetchedPerLitreMoney: 0,
    });
  });
});
