import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Who holds the farm's cash: each cash Money Event names the hand it went into or came out of, and a Handover moves it
// on — to another hand, or to the bank with its slip.

const suffix = `cash-${Date.now()}`;
const NOW = "2071-05-10T06:00:00.000Z";

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let manureId = "";
let utilitiesId = "";

beforeAll(async () => {
  // Both hands exist on the farm before anybody asks what is in them.
  await as("owner");
  const manager = await as("manager");
  const categories = await manager.client.money.categories.list();
  const keyed = (key: string) =>
    categories.find((one) => one.key === key)?.id ?? "";
  manureId = keyed("manure_sales");
  utilitiesId = keyed("utilities");
});

const handOf = async (role: "owner" | "manager") => {
  const owner = await as("owner");
  const hands = await owner.client.cash.inHand();
  return hands.find((one) => one.userId === thePerson(role).id)?.amount ?? 0;
};

const manureSold = async (
  role: "owner" | "manager",
  amountMoney: number,
  paymentMethod: "cash" | "mobile_money" = "cash"
) => {
  const client = await as(role);
  return await client.client.money.enter({
    categoryId: manureId,
    amountMoney,
    occurredOn: "2071-05-10",
    counterparty: { name: `গোবর ক্রেতা ${suffix}` },
    paymentMethod,
  });
};

describe("cash in hand", () => {
  it("names the hand of whoever took the notes, and never mobile money", async () => {
    const before = await handOf("manager");
    const cash = await manureSold("manager", 3000);
    const mobileMoney = await manureSold("manager", 1000, "mobile_money");
    expect(await handOf("manager")).toBe(before + 3000);
    const hands = await scratchDb().query.moneyEvent.findMany({
      where: { id: { in: [cash.id, mobileMoney.id] } },
      columns: { id: true, heldBy: true },
    });
    expect(hands.find((one) => one.id === cash.id)?.heldBy).toBe(
      thePerson("manager").id
    );
    expect(hands.find((one) => one.id === mobileMoney.id)?.heldBy).toBeNull();
  });

  it("takes cash paid out of the hand that paid it", async () => {
    const before = await handOf("manager");
    const manager = await as("manager");
    await manager.client.money.enter({
      categoryId: utilitiesId,
      amountMoney: 1200,
      occurredOn: "2071-05-10",
      counterparty: { name: `পল্লী বিদ্যুৎ ${suffix}` },
      paymentMethod: "cash",
    });
    expect(await handOf("manager")).toBe(before - 1200);
  });

  it("moves with a Handover from the Manager to the Owner", async () => {
    const manager = await as("manager");
    const managerBefore = await handOf("manager");
    const ownerBefore = await handOf("owner");
    await manager.client.cash.handOver({
      from: { userId: thePerson("manager").id },
      to: { userId: thePerson("owner").id },
      amountMoney: 2000,
    });
    expect(await handOf("manager")).toBe(managerBefore - 2000);
    expect(await handOf("owner")).toBe(ownerBefore + 2000);
    const mine = await manager.client.cash.movements({
      userId: thePerson("manager").id,
    });
    expect(mine[0]).toMatchObject({ amount: -2000, kind: "handover" });
  });

  it("leaves a hand for the bank only with its slip", async () => {
    const owner = await as("owner");
    await expect(
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { bank: true },
        amountMoney: 1000,
      })
    ).rejects.toMatchObject({ data: { refusal: "bank_needs_a_slip" } });
    const before = await handOf("owner");
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { bank: true },
      amountMoney: 1000,
      reference: `জমা স্লিপ ${suffix}`,
    });
    expect(await handOf("owner")).toBe(before - 1000);
  });

  it("is the Owner's to read and move for anybody else", async () => {
    const manager = await as("manager");
    const mine = await manager.client.cash.inHand();
    expect(mine.map((one) => one.userId)).toEqual([thePerson("manager").id]);
    await expect(
      manager.client.cash.movements({ userId: thePerson("owner").id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { userId: thePerson("manager").id },
        amountMoney: 500,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves the hand when a Correction says it was mobile money after all", async () => {
    const entered = await manureSold("manager", 700);
    const before = await handOf("manager");
    const manager = await as("manager");
    await manager.client.money.correctEntered({
      id: entered.id,
      changes: { paymentMethod: { from: "cash", to: "mobile_money" } },
      reason: `বিকাশে দিয়েছিল ${suffix}`,
    });
    expect(await handOf("manager")).toBe(before - 700);
  });
});
