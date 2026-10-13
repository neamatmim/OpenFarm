import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * From the first of a month the Owner's home names every open Farm Account whose last month's statement nobody has read:
 * the Bank Check is monthly, and an account not read is money the farm counts as nothing (CONTEXT.md: **Cash Position**).
 */
const suffix = `unread-${Date.now()}`;

const owner = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

let bkashId = "";
let bankId = "";
let retiredId = "";
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
  await client.farmAccounts.retire({ id: retired.id });
  const march = await owner("2084-03-01T04:00:00.000Z");
  const listedInMarch = await march.client.farmAccounts.create({
    kind: "mobile_money",
    name: `নতুন বিকাশ ${suffix}`,
    number: "01711000504",
  });
  bkashId = bkash.id;
  bankId = bank.id;
  retiredId = retired.id;
  newId = listedInMarch.id;
});

describe("the month's statements nobody has read", () => {
  it("names every open account whose last month is not read, from the first of the month", async () => {
    const named = await unreadOn("2084-03-02T04:00:00.000Z");
    expect(named.map((one) => one.id).toSorted()).toEqual(
      [bkashId, bankId].toSorted()
    );
    expect(named.every((one) => one.month === "2084-02")).toBe(true);
  });

  it("leaves out a retired account, and one listed only this month", async () => {
    const named = await unreadOn("2084-03-02T04:00:00.000Z");
    const ids = named.map((one) => one.id);
    expect(ids).not.toContain(retiredId);
    expect(ids).not.toContain(newId);
  });

  it("stops naming an account once its last month is read", async () => {
    const { client } = await owner("2084-03-02T05:00:00.000Z");
    await client.farmAccounts.check({
      id: bkashId,
      month: "2084-02",
      readMoney: 4000,
    });
    const named = await unreadOn("2084-03-02T06:00:00.000Z");
    expect(named.map((one) => one.id)).toEqual([bankId]);
  });
});
