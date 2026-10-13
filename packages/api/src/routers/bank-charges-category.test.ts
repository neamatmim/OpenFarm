import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A bKash cash-out fee or a bank's charge is money the farm pays and the statement shows: with nowhere to write it, the
 * monthly Bank Check disagrees by it every month. Every farm has a standard Category for it.
 */
const suffix = `charges-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

describe("bank and mobile money charges", () => {
  it("are a standard Category every farm has, entered by hand, money going out", async () => {
    const { client } = await as("manager", "2085-02-03T04:00:00.000Z");
    const categories = await client.money.categories.list();
    expect(categories.find((one) => one.key === "bank_charges")).toMatchObject({
      nameEn: "Bank and mobile money charges",
      direction: "out",
      enterable: true,
      retirable: true,
    });
  });

  it("let the month's Bank Check agree with a statement that took the fee", async () => {
    const owner = await as("owner", "2085-03-02T04:00:00.000Z");
    const account = await owner.client.farmAccounts.create({
      kind: "mobile_money",
      name: `অফিস বিকাশ ${suffix}`,
      number: "01711000601",
    });
    // February's statement is the first reading: ৳10,000 in the number.
    await owner.client.farmAccounts.check({
      id: account.id,
      month: "2085-02",
      readMoney: 10_000,
    });
    // In March bKash took ৳37 for a cash-out, and the Manager writes it down against the number.
    const manager = await as("manager", "2085-03-15T05:00:00.000Z");
    const categories = await manager.client.money.categories.list();
    const charges = categories.find((one) => one.key === "bank_charges");
    await manager.client.money.enter({
      categoryId: charges?.id ?? "",
      amountMoney: 37,
      occurredOn: "2085-03-15",
      counterparty: { name: "বিকাশ" },
      paymentMethod: "mobile_money",
      farmAccountId: account.id,
      reference: `FEE-${suffix}`,
    });
    // March's statement shows the ৳37 gone: the farm's books say the same.
    const april = await as("owner", "2085-04-02T04:00:00.000Z");
    const march = await april.client.farmAccounts.check({
      id: account.id,
      month: "2085-03",
      readMoney: 9963,
    });
    expect(march).toMatchObject({ expectedMoney: 9963, differenceMoney: 0 });
  });
});
