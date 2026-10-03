import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Each month the Owner reads a Farm Account's statement against what the farm believes it held at the month's end —
 * the Bank Check, of the Farm's own mobile money number. Manure sold for cash and written as mobile money, with a TrxID made up to
 * get past the form, is a month the statement will not agree with.
 */
const suffix = `account-check-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let manureId = "";
let repairsId = "";
let accountId = "";
let fakeId = "";

/** Money entered by the Manager on the day it happened. */
const entered = async (
  day: string,
  categoryId: string,
  amountMoney: number,
  sheet: { paymentMethod: "cash" | "mobile_money"; reference?: string }
) => {
  const manager = await as("manager", `${day}T10:00:00.000Z`);
  return await manager.client.money.enter({
    categoryId,
    amountMoney,
    occurredOn: day,
    counterparty: { name: `ক্রেতা ${suffix}` },
    note: `${amountMoney} ${suffix}`,
    paymentMethod: sheet.paymentMethod,
    ...(sheet.reference
      ? { farmAccountId: accountId, reference: sheet.reference }
      : {}),
  });
};

const checked = async (
  month: string,
  readMoney: number,
  note?: string,
  instant = "2083-07-02T10:00:00.000Z"
) => {
  const owner = await as("owner", instant);
  return await owner.client.farmAccounts.check({
    id: accountId,
    month,
    readMoney,
    ...(note ? { note } : {}),
  });
};

const standing = async (instant = "2083-07-02T10:00:00.000Z") => {
  const owner = await as("owner", instant);
  const listed = await owner.client.farmAccounts.list();
  return listed.find((one) => one.id === accountId)?.standing;
};

beforeAll(async () => {
  const owner = await as("owner", "2083-04-01T03:00:00.000Z");
  await as("manager", "2083-04-01T03:00:00.000Z");
  const categories = await owner.client.money.categories();
  manureId = categories.find((one) => one.key === "manure_sales")?.id ?? "";
  repairsId = categories.find((one) => one.key === "repairs")?.id ?? "";
  const office = await owner.client.farmAccounts.create({
    kind: "mobile_money",
    name: `অফিস বিকাশ ${suffix}`,
    number: "01711000077",
  });
  accountId = office.id;
  // May: ৳3,000 of manure really paid by mobile money, and ৳5,000 sold for cash but written as mobile money.
  await entered("2083-05-10", manureId, 3000, {
    paymentMethod: "mobile_money",
    reference: `TRX-REAL-${suffix}`,
  });
  const fake = await entered("2083-05-20", manureId, 5000, {
    paymentMethod: "mobile_money",
    reference: `TRX-MADE-UP-${suffix}`,
  });
  fakeId = fake.id;
});

describe("a Farm Account's monthly check", () => {
  it("takes the first reading as what it held", async () => {
    const first = await checked(
      "2083-04",
      10_000,
      undefined,
      "2083-05-02T10:00:00.000Z"
    );
    expect(first).toMatchObject({ expectedMoney: 10_000, differenceMoney: 0 });
  });

  it("disagrees by the mobile money money that never reached the number", async () => {
    // What the farm believes: ৳10,000, the ৳3,000 that came in, and the ৳5,000 that never did.
    const may = await checked(
      "2083-05",
      13_000,
      undefined,
      "2083-06-02T10:00:00.000Z"
    );
    expect(may).toMatchObject({
      expectedMoney: 18_000,
      differenceMoney: -5000,
    });
    expect(await standing()).toMatchObject({
      lastCheckedMonth: "2083-05",
      monthsOut: ["2083-05"],
      monthsStale: [],
    });
    // And the Owner's home names it until it agrees.
    const owner = await as("owner", "2083-06-02T11:00:00.000Z");
    const home = await owner.client.overview.get();
    expect(home.needsYou.farmAccountsOut).toEqual([
      expect.objectContaining({ id: accountId, monthsOut: ["2083-05"] }),
    ]);
  });

  it("will not come right without a word of what she found out", async () => {
    await expect(
      checked("2083-05", 18_000, undefined, "2083-06-02T10:00:00.000Z")
    ).rejects.toMatchObject({
      data: { refusal: "say_what_you_found_out" },
    });
  });

  it("goes stale when a Correction moves the month, and agrees once read again", async () => {
    const manager = await as("manager", "2083-06-03T09:00:00.000Z");
    await manager.client.money.correctEntered({
      id: fakeId,
      reason: `নগদে বিক্রি হয়েছিল ${suffix}`,
      changes: { paymentMethod: { from: "mobile_money", to: "cash" } },
    });
    expect(await standing()).toMatchObject({
      monthsOut: ["2083-05"],
      monthsStale: ["2083-05"],
    });
    await checked(
      "2083-05",
      13_000,
      `গোবরের টাকা নগদে এসেছিল ${suffix}`,
      "2083-06-03T10:00:00.000Z"
    );
    expect(await standing()).toMatchObject({ monthsOut: [], monthsStale: [] });
    const owner = await as("owner", "2083-06-03T11:00:00.000Z");
    const home = await owner.client.overview.get();
    expect(home.needsYou.farmAccountsOut).toEqual([]);
  });

  it("agrees the next month with the money and the Handovers that named it", async () => {
    await entered("2083-06-05", repairsId, 1000, {
      paymentMethod: "mobile_money",
      reference: `TRX-OUT-${suffix}`,
    });
    // The Manager's cash from manure, put into the mobile money number at an agent.
    await entered("2083-06-08", manureId, 3000, { paymentMethod: "cash" });
    const manager = await as("manager", "2083-06-09T10:00:00.000Z");
    await manager.client.cash.handOver({
      from: { userId: thePerson("manager").id },
      to: { farmAccountId: accountId },
      amountMoney: 2000,
      reference: `CASH-IN-${suffix}`,
    });
    const june = await checked("2083-06", 14_000);
    expect(june).toMatchObject({ expectedMoney: 14_000, differenceMoney: 0 });
    expect(await standing()).toMatchObject({
      lastCheckedMonth: "2083-06",
      monthsOut: [],
      heldNowMoney: 14_000,
    });
  });

  it("refuses a month not over, or one before the first reading", async () => {
    await expect(checked("2083-07", 14_000)).rejects.toMatchObject({
      data: { refusal: "month_not_over" },
    });
    await expect(checked("2083-03", 9000)).rejects.toMatchObject({
      data: { refusal: "before_the_first_reading" },
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2083-07-02T10:00:00.000Z");
    await expect(
      manager.client.farmAccounts.check({
        id: accountId,
        month: "2083-06",
        readMoney: 14_000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const listed = await manager.client.farmAccounts.list();
    expect(listed.find((one) => one.id === accountId)?.standing).toBeNull();
  });
});
