import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * From the first of each month the Owner is told, in the evening's post, which running Ventures owe the Farm the
 * month just over and how much — once for each Venture and month — so a month is not first found owing at the
 * Settlement, while the Farm has carried its feed all along.
 */
const suffix = `due-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let ventureId = "";
let sprayId = "";

/** A Herd Cost for the Fattening side, entered by the Owner, wholly the Venture's one bull's. */
const sprayed = async (
  instant: string,
  occurredOn: string,
  amountMoney: number
) => {
  const owner = await as("owner", instant);
  await owner.client.money.enter({
    categoryId: sprayId,
    amountMoney,
    occurredOn,
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `${occurredOn} ${amountMoney} ${suffix}`,
  });
};

/** What the Owner has been told about this Venture's Reimbursements: each month and its taka. */
const toldOf = async (role: "owner" | "manager", instant: string) => {
  const who = await as(role, instant);
  const alerts = await who.client.alerts.mine({ about: ventureId });
  return alerts
    .filter((one) => one.kind === "reimbursement_due")
    .map((one) => one.params as { month: string; owedMoney: number })
    .map((one) => ({ month: one.month, owedMoney: one.owedMoney }));
};

const sweptOn = async (instant: string) => {
  const owner = await as("owner", instant);
  await owner.client.alerts.sweep();
};

const reimburse = async (instant: string, month: string) => {
  const owner = await as("owner", instant);
  const figure = await owner.client.ventures.consumption({ ventureId, month });
  await owner.client.ventures.reimburse({
    ventureId,
    month,
    movedOn: instant.slice(0, 10),
    paymentMethod: "bank",
    reference: `REI-${month}-${suffix}`,
    amountMoney: figure.totalMoney,
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2078-01-02T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2078-01-02",
    targetWindowStart: "2078-09-01",
    targetWindowEnd: "2078-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2078-01-02"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const spray = await owner.client.money.createCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  sprayId = spray.id;
  await owner.client.money.setChargedToAnimals({
    categoryId: sprayId,
    chargedToAnimals: true,
  });
  const buyer = await as("owner", "2078-01-02T06:00:00.000Z");
  await buyer.client.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2078-01-02T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });
});

describe("a month's Reimbursement due", () => {
  it("is told to the Owner from the first of the month, with its taka, once", async () => {
    await sprayed("2078-01-20T06:00:00.000Z", "2078-01-20", 3000);
    await sweptOn("2078-02-01T04:00:00.000Z");
    // A second turn of the day says nothing more.
    await sweptOn("2078-02-01T09:00:00.000Z");
    expect(await toldOf("owner", "2078-02-01T10:00:00.000Z")).toEqual([
      { month: "2078-01", owedMoney: 3000 },
    ]);
    // The Venture Account is the Owner's: the Manager is not told what it owes.
    expect(await toldOf("manager", "2078-02-01T10:00:00.000Z")).toEqual([]);
  });

  it("says nothing of a month already repaid, nor of one that came to nothing", async () => {
    await reimburse("2078-02-02T04:00:00.000Z", "2078-01");
    // February costs nothing at all, and January has been repaid.
    await sweptOn("2078-03-01T04:00:00.000Z");
    expect(await toldOf("owner", "2078-03-01T10:00:00.000Z")).toEqual([
      { month: "2078-01", owedMoney: 3000 },
    ]);
  });

  it("is due for a month whose only figure is what it carries", async () => {
    // A late bill for January, after January was repaid: March has nothing of its own, but carries it.
    await sprayed("2078-03-05T06:00:00.000Z", "2078-01-25", 2000);
    await sweptOn("2078-04-01T04:00:00.000Z");
    expect(await toldOf("owner", "2078-04-01T10:00:00.000Z")).toContainEqual({
      month: "2078-03",
      owedMoney: 2000,
    });
  });
});
