import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A cost that lands in a month a Venture has already reimbursed reaches the Farm with the next month's transfer, as
 * its own line — more or less — so the Farm is never out of pocket for the Investors' animals and no month is paid
 * for twice.
 */
const suffix = `carried-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let ventureId = "";
let sprayId = "";
const entered = new Map<string, string>();

/** A Herd Cost for the Fattening side, entered by the Owner on one day for another, so it waits for nobody. */
const sprayed = async (
  instant: string,
  occurredOn: string,
  amountMoney: number
) => {
  const owner = await as("owner", instant);
  const { id } = await owner.client.money.enter({
    categoryId: sprayId,
    amountMoney,
    occurredOn,
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `${occurredOn} ${amountMoney} ${suffix}`,
  });
  entered.set(`${occurredOn}:${amountMoney}`, id);
};

const consumption = async (instant: string, month: string) => {
  const owner = await as("owner", instant);
  return await owner.client.ventures.consumption({ ventureId, month });
};

/** The month's Reimbursement taken at whatever the farm says it comes to. */
const reimbursed = async (instant: string, month: string) => {
  const owner = await as("owner", instant);
  const figure = await owner.client.ventures.consumption({ ventureId, month });
  return await owner.client.ventures.reimburse({
    ventureId,
    month,
    movedOn: instant.slice(0, 10),
    paymentMethod: "bank",
    reference: `REI-${month}-${suffix}`,
    amountMoney: figure.totalMoney,
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2076-01-02T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2076-01-02",
    targetWindowStart: "2076-09-01",
    targetWindowEnd: "2076-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2076-01-02"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const spray = await owner.client.money.addCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  sprayId = spray.id;
  await owner.client.money.setChargedToAnimals({
    categoryId: sprayId,
    chargedToAnimals: true,
  });
  // The Venture's one bull, and the only animal on the side: every Herd Cost is wholly his.
  const buyer = await as("owner", "2076-01-02T06:00:00.000Z");
  await buyer.client.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2076-01-02T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });
});

describe("a cost that lands in a month already reimbursed", () => {
  it("rides on the next month's Reimbursement, as its own line", async () => {
    await sprayed("2076-01-20T06:00:00.000Z", "2076-01-20", 3000);
    const january = await reimbursed("2076-02-02T04:00:00.000Z", "2076-01");
    expect(january.totalMoney).toBe(3000);
    // A second bill for January turns up after January was repaid, and February has its own.
    await sprayed("2076-02-03T06:00:00.000Z", "2076-01-25", 2000);
    await sprayed("2076-02-10T06:00:00.000Z", "2076-02-10", 1000);

    const february = await consumption("2076-03-02T04:00:00.000Z", "2076-02");
    expect(february).toMatchObject({
      ownMoney: 1000,
      carried: [{ month: "2076-01", amount: 2000 }],
      totalMoney: 3000,
    });
    const taken = await reimbursed("2076-03-02T04:00:00.000Z", "2076-02");
    expect(taken.totalMoney).toBe(3000);
    // Carried once: the month after carries nothing more for January.
    await sprayed("2076-03-10T06:00:00.000Z", "2076-03-10", 500);
    const march = await consumption("2076-04-02T04:00:00.000Z", "2076-03");
    expect(march).toMatchObject({
      ownMoney: 500,
      carried: [],
      totalMoney: 500,
    });
    await reimbursed("2076-04-02T04:00:00.000Z", "2076-03");
  });

  it("carries less when a cost is put right down, and rides a total of nothing on to the month after", async () => {
    // January's first bill was really two and a half thousand.
    const owner = await as("owner", "2076-04-05T04:00:00.000Z");
    await owner.client.money.correctEntered({
      id: entered.get("2076-01-20:3000") ?? "",
      reason: `বিলে আসলে কম ছিল ${suffix}`,
      changes: { amountMoney: { from: 3000, to: 2500 } },
    });
    // April has nothing of its own, so all it would carry is five hundred less: nothing to send.
    const april = await consumption("2076-05-02T04:00:00.000Z", "2076-04");
    expect(april).toMatchObject({
      ownMoney: 0,
      carried: [{ month: "2076-01", amount: -500 }],
      totalMoney: -500,
    });
    const tryingApril = await as("owner", "2076-05-02T04:00:00.000Z");
    await expect(
      tryingApril.client.ventures.reimburse({
        ventureId,
        month: "2076-04",
        movedOn: "2076-05-02",
        paymentMethod: "bank",
        reference: `REI-2076-04-${suffix}`,
        amountMoney: 0,
      })
    ).rejects.toMatchObject({ data: { refusal: "nothing_to_reimburse" } });
    // May's own thousand takes it.
    await sprayed("2076-05-10T06:00:00.000Z", "2076-05-10", 1000);
    const may = await consumption("2076-06-02T04:00:00.000Z", "2076-05");
    expect(may).toMatchObject({
      ownMoney: 1000,
      carried: [{ month: "2076-01", amount: -500 }],
      totalMoney: 500,
    });
    await reimbursed("2076-06-02T04:00:00.000Z", "2076-05");
  });

  it("takes months out of order, each paid for once", async () => {
    await sprayed("2076-06-10T06:00:00.000Z", "2076-06-10", 700);
    await sprayed("2076-07-10T06:00:00.000Z", "2076-07-10", 900);
    // July first: June has never been paid, so July carries nothing of it.
    const july = await consumption("2076-08-02T04:00:00.000Z", "2076-07");
    expect(july).toMatchObject({ ownMoney: 900, carried: [], totalMoney: 900 });
    await reimbursed("2076-08-02T04:00:00.000Z", "2076-07");
    // Then June, its own figure once.
    const june = await consumption("2076-08-03T04:00:00.000Z", "2076-06");
    expect(june).toMatchObject({ ownMoney: 700, carried: [], totalMoney: 700 });
    await reimbursed("2076-08-03T04:00:00.000Z", "2076-06");
  });

  it("is owed in the Settlement until it is carried", async () => {
    // A late bill for June, after June was repaid: the Settlement owes it, and says how much.
    await sprayed("2076-08-04T06:00:00.000Z", "2076-06-20", 400);
    const owner = await as("owner", "2076-08-05T04:00:00.000Z");
    const settlement = await owner.client.ventures.settlement({ ventureId });
    expect(settlement.blocks).toContainEqual({
      word: "a_reimbursement_is_owed",
      months: [],
      carryMoney: 400,
    });
  });
});
