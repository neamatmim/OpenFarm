import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Sale or a Dispatch his payments have already cleared some of: the money is his, on that debt. A Correction that would
 * leave him owing less than he has paid, or move the debt to another buyer, is refused — it is the payment that is put
 * right, and a payment written wrong can be voided. A Sale nothing was paid off can still be voided, whatever else he
 * paid the farm.
 */
const suffix = `paid-on-it-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const PERIOD = { from: "2052-03-01", to: "2052-03-31" };
const WINDOW = {
  targetWindowStart: "2052-06-17",
  targetWindowEnd: "2052-06-19",
};

let penId = "";

const buy = async (instant: string) => {
  const manager = await as("manager", instant);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 40_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ...WINDOW,
  });
};

/** A bull sold to this trader for ৳50,000: ৳10,000 at the gate, the rest promised by the month's end. */
const sellOnCredit = async (trader: string, instant: string) => {
  const bull = await buy(instant);
  const manager = await as("manager", instant);
  const sold = await manager.client.sales.record({
    tagNumber: bull.tagNumber,
    buyer: { name: trader },
    priceMoney: 50_000,
    paidNowMoney: 10_000,
    promisedBy: "2052-03-31",
    weightKg: 300,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ট্রাক",
    driver: `চালক ${suffix}`,
  });
  return { ...sold, tagNumber: bull.tagNumber };
};

const pay = async (
  buyer: string,
  kind: "cattle" | "milk",
  amountMoney: number,
  paidOn: string
) => {
  const manager = await as("manager", `${paidOn}T08:00:00.000Z`);
  return await manager.client.receivables.pay({
    buyer,
    kind,
    amountMoney,
    paidOn,
    paymentMethod: "cash",
  });
};

/** All the cash the Farm's register shows for a record. */
const cashInFor = async (sourceId: string) => {
  const owner = await as("owner", "2052-03-31T12:00:00.000Z");
  const money = await owner.client.money.list(PERIOD);
  return money.events
    .filter((one) => one.sourceId === sourceId)
    .reduce((sum, one) => sum + one.amountMoney, 0);
};

beforeAll(async () => {
  const owner = await as("owner", "2052-03-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
});

describe("a Sale his payments have cleared", () => {
  it("is not put right to say he paid it all at the gate", async () => {
    const trader = `রহিম ${suffix}`;
    const sold = await sellOnCredit(trader, "2052-03-02T05:00:00.000Z");
    await pay(trader, "cattle", 40_000, "2052-03-05");
    const manager = await as("manager", "2052-03-06T05:00:00.000Z");
    await expect(
      manager.client.sales.correct({
        id: sold.id,
        reason: "গেটেই পুরো দাম দিয়েছিল",
        changes: { paidNowMoney: { from: 10_000, to: 50_000 } },
      })
    ).rejects.toMatchObject({
      data: { refusal: "owed_below_paid", paidMoney: 40_000 },
    });
    // The register still says ৳10,000 came at the gate, not ৳50,000 beside his ৳40,000.
    expect(await cashInFor(sold.id)).toBe(10_000);
  });

  it("is not moved to another buyer, and can be until he pays", async () => {
    const trader = `করিম ${suffix}`;
    const sold = await sellOnCredit(trader, "2052-03-02T05:10:00.000Z");
    const manager = await as("manager", "2052-03-03T05:00:00.000Z");
    // Nothing paid on it yet: the name typed wrong is put right.
    await manager.client.sales.correct({
      id: sold.id,
      reason: "অন্য ব্যাপারীর নাম লেখা হয়েছিল",
      changes: { buyer: { from: trader, to: { name: `জব্বার ${suffix}` } } },
    });
    await pay(`জব্বার ${suffix}`, "cattle", 20_000, "2052-03-04");
    const later = await as("manager", "2052-03-05T05:00:00.000Z");
    await expect(
      later.client.sales.correct({
        id: sold.id,
        reason: "আসলে করিম নিয়েছিল",
        changes: {
          buyer: { from: `জব্বার ${suffix}`, to: { name: trader } },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "paid_on_by_this_buyer" } });
  });
});

describe("a Sale voided", () => {
  it("is voided when nothing was paid off it, whatever else the buyer paid", async () => {
    // A regular trader: one bull paid off in full, then another written against the wrong tag.
    const trader = `নিয়মিত ${suffix}`;
    await sellOnCredit(trader, "2052-03-07T05:00:00.000Z");
    await pay(trader, "cattle", 40_000, "2052-03-08");
    const wrong = await sellOnCredit(trader, "2052-03-09T05:00:00.000Z");
    const owner = await as("owner", "2052-03-10T05:00:00.000Z");
    await owner.client.sales.correct({
      id: wrong.id,
      reason: "ভুল ট্যাগে লেখা হয়েছিল",
      changes: { voided: { from: false, to: true } },
    });
    const gone = await scratchDb().query.sale.findFirst({
      where: { id: wrong.id },
      columns: { id: true },
    });
    expect(gone).toBeUndefined();
  });

  it("is refused once he paid some of it", async () => {
    const trader = `আংশিক ${suffix}`;
    const sold = await sellOnCredit(trader, "2052-03-11T05:00:00.000Z");
    await pay(trader, "cattle", 5000, "2052-03-12");
    const owner = await as("owner", "2052-03-13T05:00:00.000Z");
    await expect(
      owner.client.sales.correct({
        id: sold.id,
        reason: "ভুল ট্যাগ",
        changes: { voided: { from: false, to: true } },
      })
    ).rejects.toMatchObject({ data: { refusal: "money_moved_since" } });
  });
});

describe("a Dispatch his payments have cleared", () => {
  it("is not put right to say he paid it all at the gate, nor moved to another buyer", async () => {
    const shop = `দোকান ${suffix}`;
    const manager = await as("manager", "2052-03-14T04:00:00.000Z");
    const sent = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2052-03-14T03:00:00.000Z"),
      liters: 40,
      buyer: { name: shop },
      pricePerLiterMoney: 75,
      paidNowMoney: 0,
    });
    await pay(shop, "milk", 2000, "2052-03-15");
    const later = await as("manager", "2052-03-16T04:00:00.000Z");
    await expect(
      later.client.milk.correctDispatch({
        id: sent.id,
        reason: "গেটেই সব দিয়েছিল",
        changes: { paidNowMoney: { from: 0, to: 3000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "owed_below_paid" } });
    await expect(
      later.client.milk.correctDispatch({
        id: sent.id,
        reason: "অন্য দোকান",
        changes: { buyer: { from: shop, to: { name: `অন্য ${suffix}` } } },
      })
    ).rejects.toMatchObject({ data: { refusal: "paid_on_by_this_buyer" } });
  });
});

describe("a Receivable Payment written wrong", () => {
  it("is voided with its Money Event, and what he owes is read again without it", async () => {
    const trader = `দুবার ${suffix}`;
    await sellOnCredit(trader, "2052-03-17T05:00:00.000Z");
    // The same ৳40,000 written twice — once on the phone, once on the laptop — the second with a note.
    await pay(trader, "cattle", 40_000, "2052-03-18");
    const manager = await as("manager", "2052-03-18T09:00:00.000Z");
    const twice = await manager.client.receivables.pay({
      buyer: trader,
      kind: "cattle",
      amountMoney: 40_000,
      paidOn: "2052-03-18",
      paymentMethod: "cash",
      note: "আগাম",
    });
    await manager.client.receivables.correctPayment({
      id: twice.id,
      reason: "একই টাকা দুবার লেখা হয়েছিল",
      changes: { voided: { from: false, to: true } },
    });
    expect(await cashInFor(twice.id)).toBe(0);
    const gone = await scratchDb().query.receivablePayment.findFirst({
      where: { id: twice.id },
      columns: { id: true },
    });
    expect(gone).toBeUndefined();
    const owner = await as("owner", "2052-03-19T05:00:00.000Z");
    const everyone = await owner.client.receivables.list();
    const his = everyone.find((one) => one.name === trader);
    // Square: nothing owed and nothing paid ahead, so he is off the list — the second ৳40,000 is not held for him.
    expect(his).toBeUndefined();
  });

  it("can then be put right where the payment was the mistake", async () => {
    // He paid it all at the gate; the ৳40,000 written as paid later never came. The payment goes, the Sale is put right.
    const trader = `গেটে সব ${suffix}`;
    const sold = await sellOnCredit(trader, "2052-03-20T05:00:00.000Z");
    const paid = await pay(trader, "cattle", 40_000, "2052-03-21");
    const manager = await as("manager", "2052-03-22T05:00:00.000Z");
    await manager.client.receivables.correctPayment({
      id: paid.id,
      reason: "এই টাকা আলাদা করে আসেনি",
      changes: { voided: { from: false, to: true } },
    });
    await manager.client.sales.correct({
      id: sold.id,
      reason: "গেটেই পুরো দাম দিয়েছিল",
      changes: { paidNowMoney: { from: 10_000, to: 50_000 } },
    });
    expect(await cashInFor(sold.id)).toBe(50_000);
  });
});

describe("a payment put right while another is taken", () => {
  it("sees the other, so the two together are never more than he owed without a note", async () => {
    // ৳40,000 owed; ৳20,000 paid. At once: another ৳20,000 taken, and the first put right to ৳40,000.
    const trader = `একসাথে ${suffix}`;
    await sellOnCredit(trader, "2052-03-23T05:00:00.000Z");
    const first = await pay(trader, "cattle", 20_000, "2052-03-24");
    const manager = await as("manager", "2052-03-24T10:00:00.000Z");
    const outcomes = await Promise.allSettled([
      manager.client.receivables.pay({
        buyer: trader,
        kind: "cattle",
        amountMoney: 20_000,
        paidOn: "2052-03-24",
        paymentMethod: "cash",
      }),
      manager.client.receivables.correctPayment({
        id: first.id,
        reason: "আসলে চল্লিশ হাজার দিয়েছিল",
        changes: { amountMoney: { from: 20_000, to: 40_000 } },
      }),
    ]);
    expect(outcomes.filter((one) => one.status === "rejected")).toHaveLength(1);
  });
});

describe("a buyer named another way on the sheet", () => {
  it("is warned of what he owes however his name is typed", async () => {
    // য় typed as one letter, as one Bangla keyboard does; the farm keeps it as য and its nukta.
    const miya = `মিয়া ${suffix}`;
    await sellOnCredit(miya, "2052-03-25T05:00:00.000Z");
    const manager = await as("manager", "2052-03-26T05:00:00.000Z");
    expect(
      await manager.client.receivables.ofBuyer({ name: miya })
    ).toMatchObject({
      owingMoney: 40_000,
    });
    // And in other capitals, as the Sale finds him.
    await sellOnCredit(`Rahim Traders ${suffix}`, "2052-03-25T05:10:00.000Z");
    expect(
      await manager.client.receivables.ofBuyer({
        name: `rahim traders ${suffix}`,
      })
    ).toMatchObject({ owingMoney: 40_000 });
  });
});

describe("credit to a buyer the farm wrote off", () => {
  it("is told to the Owner, with what was written off and when", async () => {
    const gone = `পালানো ${suffix}`;
    const first = await sellOnCredit(gone, "2052-03-27T05:00:00.000Z");
    const owner = await as("owner", "2052-03-28T05:00:00.000Z");
    await owner.client.receivables.writeOff({
      source: "sale",
      id: first.id,
      amountMoney: 40_000,
      why: "এলাকা ছেড়েছে",
    });
    const again = await sellOnCredit(gone, "2052-03-29T05:00:00.000Z");
    const told = await scratchDb().query.alert.findMany({
      where: {
        kind: "credit_after_write_off",
        userId: thePerson("owner").id,
        entityId: again.id,
      },
      columns: { params: true },
    });
    expect(told.map((one) => one.params)).toEqual([
      expect.objectContaining({
        buyer: gone,
        lentMoney: 40_000,
        writtenOffMoney: 40_000,
        writtenOffOn: "2052-03-28",
      }),
    ]);
  });
});

describe("a buyer's phone", () => {
  it("is put right by the Manager, with why, and the old number kept on the trail", async () => {
    const trader = `নতুন নম্বর ${suffix}`;
    await sellOnCredit(trader, "2052-03-30T05:00:00.000Z");
    const manager = await as("manager", "2052-03-30T06:00:00.000Z");
    const listed = await manager.client.receivables.list();
    const his = listed.find((one) => one.name === trader);
    if (!his) {
      throw new Error("expected the trader on the list");
    }
    await manager.client.receivables.setPhone({
      counterpartyId: his.counterpartyId,
      phone: "01711000123",
      reason: "পুরনো নম্বর বন্ধ",
    });
    const after = await manager.client.receivables.list();
    expect(after.find((one) => one.name === trader)?.phone).toBe("01711000123");
    const owner = await as("owner", "2052-03-30T07:00:00.000Z");
    const trail = await owner.client.audit.list({
      entity: "receivable",
      entityId: his.counterpartyId,
    });
    expect(trail[0]).toMatchObject({
      reason: "পুরনো নম্বর বন্ধ",
      before: { phone: null },
      after: { phone: "01711000123" },
    });
  });
});
