import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Farm's own money now (CONTEXT.md: **Cash Position**; ADR 0023), the one figure for "how much have we got".
//
// The Owner put ৳200,000 of their own notes into the farm on 28 April 2047. The bank account's April statement read
// ৳100,000. A bKash number was listed on 1 May and nobody has read a statement of it: it counts nothing, and is named.
// An old Nagad number, listed by mistake and retired the same day, was never read either: retired, it is not named.
// On 10 May the Farm holds ৳300,000 of its own.

const as = (role: "owner" | "manager", instant: string, onShedPhone = false) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    onShedPhone,
  });

const NOW = "2047-05-10T04:00:00.000Z";

beforeAll(async () => {
  const owner = await as("owner", "2047-04-25T04:00:00.000Z");
  const ownersMoney = await owner.client.money.categories.create({
    nameBn: "মালিকের টাকা",
    direction: "in",
  });
  const bank = await owner.client.farmAccounts.create({
    kind: "bank",
    name: "সোনালী চলতি",
    number: "0123456789",
    bank: "সোনালী ব্যাংক",
    branch: "সাভার",
  });
  const putIn = await as("owner", "2047-04-28T04:00:00.000Z");
  await putIn.client.money.enter({
    categoryId: ownersMoney.id,
    amountMoney: 200_000,
    occurredOn: "2047-04-28",
    paymentMethod: "cash",
    counterparty: { name: "মালিক" },
  });
  const later = await as("owner", "2047-05-01T04:00:00.000Z");
  await later.client.farmAccounts.create({
    kind: "mobile_money",
    name: "খামারের বিকাশ",
    number: "01711000000",
  });
  const mistake = await later.client.farmAccounts.create({
    kind: "mobile_money",
    name: "পুরনো নগদ",
    number: "01811000000",
  });
  await later.client.farmAccounts.retire({ id: mistake.id });
  await later.client.farmAccounts.check({
    id: bank.id,
    month: "2047-04",
    readMoney: 100_000,
  });
});

describe("the Farm's own money now", () => {
  it("is the notes in the hands and each account as its statements say, the unread one named and counting nothing", async () => {
    const { client: owner } = await as("owner", NOW);

    const now = await owner.cash.farmsOwnNow();

    expect(now).toMatchObject({
      farmsInHandsMoney: 200_000,
      inAccountsMoney: 100_000,
      farmsOwnMoney: 300_000,
      accountsNotRead: 1,
      accountsNotReadNames: ["খামারের বিকাশ"],
    });
  });

  it("is the figure the month's report ends on for a month still going", async () => {
    const { client: owner } = await as("owner", NOW);

    const [now, report] = await Promise.all([
      owner.cash.farmsOwnNow(),
      owner.monthlyReport.month({ month: "2047-05" }),
    ]);

    expect(now.farmsOwnMoney).toBe(report.figures.atEnd.cash.farmsOwnMoney);
  });

  it("is not read on a Shed Phone, which anybody in the shed may pick up", async () => {
    const { client: shed } = await as("owner", NOW, true);

    await expect(shed.cash.farmsOwnNow()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("is the Owner's alone: a Manager reads their own hand, not the farm's whole", async () => {
    const { client: manager } = await as("manager", NOW);

    await expect(manager.cash.farmsOwnNow()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
