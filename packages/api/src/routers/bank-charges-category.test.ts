import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A bKash cash-out fee or a bank's charge is money the farm pays and the statement shows: with nowhere to write it, the
 * monthly Bank Check disagrees by it every month. Every farm has a standard Category for it.
 */
describe("bank and mobile money charges", () => {
  it("are a standard Category every farm has, entered by hand, money going out", async () => {
    const { client } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2085-02-03T04:00:00.000Z"),
    });
    const categories = await client.money.categories.list();
    expect(categories.find((one) => one.key === "bank_charges")).toMatchObject({
      nameEn: "Bank and mobile money charges",
      direction: "out",
      enterable: true,
      retirable: true,
    });
  });

  it("take a charge entered by hand", async () => {
    const { client } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2085-02-03T05:00:00.000Z"),
    });
    const categories = await client.money.categories.list();
    const charges = categories.find((one) => one.key === "bank_charges");
    const entered = await client.money.enter({
      categoryId: charges?.id ?? "",
      amountMoney: 37,
      occurredOn: "2085-02-03",
      counterparty: { name: "বিকাশ" },
      paymentMethod: "cash",
    });
    expect(entered.id).toBeTruthy();
  });
});
