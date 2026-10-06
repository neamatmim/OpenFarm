import { and, eq } from "@OpenFarm/db/operators";
import { roleAssignment } from "@OpenFarm/db/schema/farm";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
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

  it("refuses cash said to have changed hands later than now, with a word for it", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.cash.handOver({
        from: { userId: thePerson("manager").id },
        to: { userId: thePerson("owner").id },
        amountMoney: 100,
        handedAt: new Date(new Date(NOW).getTime() + 60 * 60 * 1000),
      })
    ).rejects.toMatchObject({ data: { refusal: "handed_later_than_now" } });
  });

  it("is taken out of the hand of a Manager who has left, by the Owner, into a hand that still holds the farm's cash", async () => {
    await manureSold("manager", 900);
    const held = await handOf("manager");
    expect(held).toBeGreaterThan(0);
    const managerRole = and(
      eq(roleAssignment.farmId, theFarm().id),
      eq(roleAssignment.userId, thePerson("manager").id),
      eq(roleAssignment.role, "manager")
    );
    await scratchDb()
      .update(roleAssignment)
      .set({ revokedAt: new Date(NOW) })
      .where(managerRole);
    try {
      const owner = await as("owner");
      const ownerBefore = await handOf("owner");
      await owner.client.cash.handOver({
        from: { userId: thePerson("manager").id },
        to: { userId: thePerson("owner").id },
        amountMoney: held,
      });
      expect(await handOf("owner")).toBe(ownerBefore + held);
      expect(await handOf("manager")).toBe(0);
      // Never into a hand that no longer holds the farm's cash.
      await expect(
        owner.client.cash.handOver({
          from: { userId: thePerson("owner").id },
          to: { userId: thePerson("manager").id },
          amountMoney: 100,
        })
      ).rejects.toMatchObject({ data: { refusal: "holds_no_cash" } });
    } finally {
      await scratchDb()
        .update(roleAssignment)
        .set({ revokedAt: null })
        .where(managerRole);
    }
  });
});

describe("cash the Owner writes up for somebody else", () => {
  it("goes into the hand that took it, as the Owner names it — and nobody else may name another's", async () => {
    const owner = await as("owner");
    const categories = await owner.client.money.categories.list();
    const manure = categories.find((one) => one.key === "manure_sales");
    const managerBefore = await handOf("manager");
    const ownerBefore = await handOf("owner");
    // The Manager sold the manure and holds the notes; the Owner writes it up that evening.
    await owner.client.money.enter({
      categoryId: manure?.id ?? "",
      amountMoney: 800,
      occurredOn: NOW.slice(0, 10),
      counterparty: { name: `গোবর ক্রেতা ${suffix}` },
      paymentMethod: "cash",
      heldBy: thePerson("manager").id,
    });
    expect(await handOf("manager")).toBe(managerBefore + 800);
    expect(await handOf("owner")).toBe(ownerBefore);
    // A Wage Draw paid out of the Manager's hand, written up by the Owner, comes out of it.
    await owner.client.money.drawWage({
      counterparty: { name: `রাখাল ${suffix}` },
      amountMoney: 300,
      drawnOn: NOW.slice(0, 10),
      heldBy: thePerson("manager").id,
    });
    expect(await handOf("manager")).toBe(managerBefore + 500);
    const manager = await as("manager");
    await expect(
      manager.client.money.enter({
        categoryId: manure?.id ?? "",
        amountMoney: 100,
        occurredOn: NOW.slice(0, 10),
        counterparty: { name: `গোবর ক্রেতা ${suffix}` },
        paymentMethod: "cash",
        heldBy: thePerson("owner").id,
      })
    ).rejects.toMatchObject({ data: { refusal: "owner_only" } });
  });
});
