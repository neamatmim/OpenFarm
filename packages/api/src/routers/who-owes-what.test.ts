import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Who owes the farm what: every buyer with Receivable, oldest first, and his payments — each one Money Event on the day it
 * came, under milk sales or cattle sales, clearing his oldest Receivable first.
 */
const suffix = `owes-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const PERIOD = { from: "2049-05-01", to: "2049-05-31" };
const WINDOW = {
  targetWindowStart: "2049-08-17",
  targetWindowEnd: "2049-08-19",
};
const TRADER = `করিম ব্যাপারী ${suffix}`;
const SHOP = `মিষ্টির দোকান ${suffix}`;

let penId = "";

const buy = async (instant: string) => {
  const manager = await as("manager", instant);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ...WINDOW,
  });
};

const sellOnCredit = async (
  instant: string,
  priceMoney: number,
  paidNowMoney: number,
  promisedBy: string
) => {
  const bull = await buy(instant);
  const manager = await as("manager", instant);
  return await manager.client.sales.record({
    tagNumber: bull.tagNumber,
    buyer: { name: TRADER, phone: "+8801711000088" },
    priceMoney,
    paidNowMoney,
    promisedBy,
    weightKg: 330,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ট্রাক",
    driver: `চালক ${suffix}`,
  });
};

const milkOnCredit = async (day: string) => {
  const manager = await as("manager", `${day}T04:00:00.000Z`);
  return await manager.client.milk.dispatch({
    dispatchedAt: new Date(`${day}T03:00:00.000Z`),
    litres: 25,
    buyer: { name: SHOP },
    pricePerLitreMoney: 70,
    paidNowMoney: 0,
  });
};

const theTrader = async (instant: string) => {
  const owner = await as("owner", instant);
  const list = await owner.client.receivables.list();
  return list.find((one) => one.name === TRADER);
};

const saleIds: string[] = [];

beforeAll(async () => {
  const owner = await as("owner", "2049-05-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // Two bulls to the one trader on two days: twenty thousand owed on the first, ten on the second.
  const first = await sellOnCredit(
    "2049-05-02T05:00:00.000Z",
    120_000,
    100_000,
    "2049-05-09"
  );
  const second = await sellOnCredit(
    "2049-05-04T05:00:00.000Z",
    110_000,
    100_000,
    "2049-05-11"
  );
  saleIds.push(first.id, second.id);
  // Three days of the sweet shop's milk, none of it paid: 1,750 a day.
  await milkOnCredit("2049-05-02");
  await milkOnCredit("2049-05-03");
  await milkOnCredit("2049-05-04");
});

describe("who owes what", () => {
  it("lists each buyer with what he owes, since when and the day he promised", async () => {
    const trader = await theTrader("2049-05-05T06:00:00.000Z");
    expect(trader).toMatchObject({
      owingMoney: 30_000,
      oldestOn: "2049-05-02",
      phone: "+8801711000088",
    });
    expect(trader?.kinds).toHaveLength(1);
    expect(trader?.kinds[0]).toMatchObject({
      kind: "cattle",
      owingMoney: 30_000,
      soonestPromise: "2049-05-09",
    });
    const owner = await as("owner", "2049-05-05T06:00:00.000Z");
    const everyone = await owner.client.receivables.list();
    const shop = everyone.find((one) => one.name === SHOP);
    expect(shop?.kinds[0]).toMatchObject({
      kind: "milk",
      owingMoney: 5250,
      soonestPromise: null,
    });
  });

  it("tells the sheets what a buyer still owes, and nothing of a stranger", async () => {
    const manager = await as("manager", "2049-05-05T06:00:00.000Z");
    const his = await manager.client.receivables.ofBuyer({ name: TRADER });
    expect(his?.owingMoney).toBe(30_000);
    expect(
      await manager.client.receivables.ofBuyer({ name: `অচেনা ${suffix}` })
    ).toBeNull();
  });
});

describe("a Receivable Payment", () => {
  it("clears his oldest Receivable first, and is one Money Event under cattle sales on the day it came", async () => {
    const manager = await as("manager", "2049-05-06T06:00:00.000Z");
    const { id } = await manager.client.receivables.pay({
      buyer: TRADER,
      kind: "cattle",
      amountMoney: 25_000,
      paidOn: "2049-05-06",
      paymentMethod: "mobile_money",
    });
    const trader = await theTrader("2049-05-06T07:00:00.000Z");
    const [cattle] = trader?.kinds ?? [];
    expect(cattle?.owingMoney).toBe(5000);
    expect(cattle?.items).toMatchObject([
      { id: saleIds[0], owingMoney: 0, paidMoney: 20_000 },
      { id: saleIds[1], owingMoney: 5000, paidMoney: 5000 },
    ]);
    expect(cattle?.payments[0]?.cleared).toEqual([
      { itemId: saleIds[0], amountMoney: 20_000 },
      { itemId: saleIds[1], amountMoney: 5000 },
    ]);

    const owner = await as("owner", "2049-05-31T12:00:00.000Z");
    const money = await owner.client.money.list(PERIOD);
    const booked = money.events.filter((one) => one.sourceId === id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({
      amountMoney: 25_000,
      direction: "in",
      categoryKey: "sale",
      paymentMethod: "mobile_money",
      counterpartyName: TRADER,
    });
  });

  it("books milk money under milk sales, and clears a round sum across several days", async () => {
    const manager = await as("manager", "2049-05-07T06:00:00.000Z");
    const { id } = await manager.client.receivables.pay({
      buyer: SHOP,
      kind: "milk",
      amountMoney: 4000,
      paidOn: "2049-05-07",
      paymentMethod: "cash",
    });
    const owner = await as("owner", "2049-05-31T12:00:00.000Z");
    const everyone = await owner.client.receivables.list();
    const shop = everyone.find((one) => one.name === SHOP);
    expect(shop?.kinds[0]?.owingMoney).toBe(1250);
    expect(shop?.kinds[0]?.payments[0]?.cleared).toHaveLength(3);
    const money = await owner.client.money.list(PERIOD);
    expect(money.events.find((one) => one.sourceId === id)).toMatchObject({
      categoryKey: "dispatch",
    });
  });

  it("refuses more than he owes without a note, and holds it as paid ahead with one", async () => {
    const manager = await as("manager", "2049-05-08T06:00:00.000Z");
    await expect(
      manager.client.receivables.pay({
        buyer: SHOP,
        kind: "milk",
        amountMoney: 2000,
        paidOn: "2049-05-08",
        paymentMethod: "cash",
      })
    ).rejects.toMatchObject({
      data: { refusal: "paid_more_than_owed", owingMoney: 1250 },
    });
    await manager.client.receivables.pay({
      buyer: SHOP,
      kind: "milk",
      amountMoney: 2000,
      paidOn: "2049-05-08",
      paymentMethod: "cash",
      note: "আগামী সপ্তাহের দুধের টাকা আগাম দিলেন",
    });
    const owner = await as("owner", "2049-05-08T07:00:00.000Z");
    const everyone = await owner.client.receivables.list();
    const shop = everyone.find((one) => one.name === SHOP);
    expect(shop?.kinds[0]).toMatchObject({
      owingMoney: 0,
      paidAheadMoney: 750,
    });
  });

  it("spends what he paid ahead on the next milk he takes on credit", async () => {
    await milkOnCredit("2049-05-09");
    const owner = await as("owner", "2049-05-09T07:00:00.000Z");
    const everyone = await owner.client.receivables.list();
    const shop = everyone.find((one) => one.name === SHOP);
    expect(shop?.kinds[0]).toMatchObject({
      owingMoney: 1000,
      paidAheadMoney: 0,
    });
  });

  it("refuses a payment from nobody the farm has sold to, and one from a day not yet come", async () => {
    const manager = await as("manager", "2049-05-10T06:00:00.000Z");
    await expect(
      manager.client.receivables.pay({
        buyer: `অচেনা ${suffix}`,
        kind: "cattle",
        amountMoney: 1000,
        paidOn: "2049-05-10",
        paymentMethod: "cash",
      })
    ).rejects.toMatchObject({ data: { refusal: "no_such_buyer" } });
    await expect(
      manager.client.receivables.pay({
        buyer: TRADER,
        kind: "cattle",
        amountMoney: 1000,
        paidOn: "2049-05-11",
        paymentMethod: "cash",
      })
    ).rejects.toMatchObject({ data: { refusal: "entered_in_the_future" } });
  });

  it("is put right with its Money Event, and re-clears what it paid for", async () => {
    const manager = await as("manager", "2049-05-12T06:00:00.000Z");
    const { id } = await manager.client.receivables.pay({
      buyer: TRADER,
      kind: "cattle",
      amountMoney: 2000,
      paidOn: "2049-05-12",
      paymentMethod: "cash",
    });
    // He still owed five thousand: two was written, and it was all five.
    await manager.client.receivables.correctPayment({
      id,
      reason: "পাঁচ হাজার দিয়েছিলেন, দুই লেখা হয়েছে",
      changes: { amountMoney: { from: 2000, to: 5000 } },
    });
    const owner = await as("owner", "2049-05-31T12:00:00.000Z");
    const money = await owner.client.money.list(PERIOD);
    const booked = money.events.filter((one) => one.sourceId === id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ amountMoney: 5000 });
    // Paid off, he leaves the list — nothing owed and nothing paid ahead.
    expect(await theTrader("2049-05-12T08:00:00.000Z")).toBeUndefined();
  });
});

describe("the accountant's export", () => {
  it("names the animals a cattle payment paid for, and what was owed at the period's end", async () => {
    const writer = await as("owner", "2049-05-31T12:00:00.000Z");
    await writer.client.farm.setIdentity({
      registrationNumber: `DLS/${suffix}`,
    });
    // A client reads its farm once, so the one that reads the export is made after the registration is written.
    const owner = await as("owner", "2049-05-31T12:00:00.000Z");
    const { csv = "" } = await owner.client.reports.accountantExport({
      ...PERIOD,
      format: "csv",
    });
    const paymentLines = csv
      .split("\n")
      .filter((line) => line.includes("receivable_payment"));
    // The trader's two payments and the shop's two.
    expect(paymentLines).toHaveLength(4);

    await owner.client.language.set({ language: "en" });
    const reader = await as("owner", "2049-05-31T12:00:00.000Z");
    // Read as at the fourth, before anybody had paid: the trader's thirty thousand and the shop's 5,250.
    const { text = "" } = await reader.client.reports.accountantExport({
      from: "2049-05-01",
      to: "2049-05-04",
      format: "paper",
    });
    expect(text).toContain("Owed to the farm at the period's end");
    expect(text).toContain(`${TRADER}: ৳30,000`);
    expect(text).toContain(`${SHOP}: ৳5,250`);
    expect(text).toContain("নিট / Net");
  });
});
