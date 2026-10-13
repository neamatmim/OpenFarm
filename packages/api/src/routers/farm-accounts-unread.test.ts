import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * From the first of a month the Owner's home names every Farm Account with a month's statement nobody has read, from
 * the month it was listed or first read up to the last month: the Bank Check is monthly, and an account not read is
 * money the farm counts as nothing (CONTEXT.md: **Cash Position**). A month skipped is not forgotten by the next.
 */
const suffix = `unread-${Date.now()}`;

const owner = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

let bkashId = "";
let bankId = "";
let retiredId = "";
let retiredLateId = "";
let newId = "";

const unreadOn = async (instant: string) => {
  const { client } = await owner(instant);
  const home = await client.overview.get();
  return (home.needsYou.farmAccountsUnread ?? []).filter((one) =>
    one.name.endsWith(suffix)
  );
};

beforeAll(async () => {
  const { client } = await owner("2084-01-10T04:00:00.000Z");
  const bkash = await client.farmAccounts.create({
    kind: "mobile_money",
    name: `অফিস বিকাশ ${suffix}`,
    number: "01711000501",
  });
  const bank = await client.farmAccounts.create({
    kind: "bank",
    name: `সোনালী ব্যাংক ${suffix}`,
    number: "4401000502",
    bank: "সোনালী ব্যাংক",
    branch: "টঙ্গী",
  });
  const retired = await client.farmAccounts.create({
    kind: "mobile_money",
    name: `পুরনো নগদ ${suffix}`,
    number: "01711000503",
  });
  const retiredLate = await client.farmAccounts.create({
    kind: "mobile_money",
    name: `বন্ধ করা বিকাশ ${suffix}`,
    number: "01711000505",
  });
  await client.farmAccounts.retire({ id: retired.id });
  const march = await owner("2084-03-01T04:00:00.000Z");
  const listedInMarch = await march.client.farmAccounts.create({
    kind: "mobile_money",
    name: `নতুন বিকাশ ${suffix}`,
    number: "01711000504",
  });
  // Closed on the second of March, with February's statement still to read.
  await march.client.farmAccounts.retire({ id: retiredLate.id });
  bkashId = bkash.id;
  bankId = bank.id;
  retiredId = retired.id;
  retiredLateId = retiredLate.id;
  newId = listedInMarch.id;
});

describe("the month's statements nobody has read", () => {
  it("names every account with a month unread, from the month it was listed, the oldest and how many", async () => {
    const named = await unreadOn("2084-03-02T04:00:00.000Z");
    const bank = named.find((one) => one.id === bankId);
    expect(bank).toMatchObject({ oldestMonth: "2084-01", months: 2 });
    expect(named.map((one) => one.id)).toContain(bkashId);
  });

  it("names an account closed this month while last month is unread, but not one closed before it, nor one listed this month", async () => {
    const named = await unreadOn("2084-03-02T04:00:00.000Z");
    const ids = named.map((one) => one.id);
    expect(ids).toContain(retiredLateId);
    expect(ids).not.toContain(retiredId);
    expect(ids).not.toContain(newId);
  });

  it("starts an account's months at its first reading, and stops naming it once every month since is read", async () => {
    const { client } = await owner("2084-03-02T05:00:00.000Z");
    await client.farmAccounts.check({
      id: bkashId,
      month: "2084-02",
      readMoney: 4000,
    });
    const named = await unreadOn("2084-03-02T06:00:00.000Z");
    expect(named.map((one) => one.id)).not.toContain(bkashId);
  });

  it("does not forget a month skipped once the next is read", async () => {
    const { client } = await owner("2084-05-02T05:00:00.000Z");
    // বিকাশ's February and April read, March never was.
    await client.farmAccounts.check({
      id: bkashId,
      month: "2084-04",
      readMoney: 4000,
    });
    const named = await unreadOn("2084-05-02T06:00:00.000Z");
    expect(named.find((one) => one.id === bkashId)).toMatchObject({
      oldestMonth: "2084-03",
      months: 1,
    });
    // And the bank, never read at all: every month since it was listed.
    expect(named.find((one) => one.id === bankId)).toMatchObject({
      oldestMonth: "2084-01",
      months: 4,
    });
  });

  it("refuses a reading of an account for a month after it was closed", async () => {
    const { client } = await owner("2084-03-02T07:00:00.000Z");
    await expect(
      client.farmAccounts.check({
        id: retiredId,
        month: "2084-02",
        readMoney: 0,
      })
    ).rejects.toMatchObject({
      data: { refusal: "farm_account_closed_by_then" },
    });
  });
});
