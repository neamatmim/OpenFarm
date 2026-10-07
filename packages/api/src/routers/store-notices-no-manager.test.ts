import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The store's notices are the Manager's, and like every notice reach the Owner when there is no Manager to tell. Their
// sweep once asked "who holds the Manager's Role?" before it asked anything else: on a farm with no Manager it found
// nobody and said nothing, and a Manager who had left was counted as never told, so every sweep wrote again.

const suffix = `${Date.now()}`;
const NOW = "2091-03-02T04:00:00.000Z";

const as = (role: "owner" | "vet" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let productId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const vet = await as("vet");
  const made = await vet.client.drugs.create({
    name: { bn: `ঘা সারানোর মলম ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  productId = made.id;
  await owner.client.drugs.purchase({
    drugProductId: productId,
    quantity: "২০ ডোজ",
    doses: 20,
    priceMoney: 2000,
    seller: { name: `ওষুধের দোকান ${suffix}` },
    purchasedOn: "2091-03-01",
    paymentMethod: "cash",
  });
  await owner.client.drugs.setLowStock({
    drugProductId: productId,
    threshold: 25,
  });
});

const lowStockTold = async (userId: string) => {
  const rows = await scratchDb().query.alert.findMany({
    where: { farmId: theFarm().id, kind: "medicine_low_stock", userId },
    columns: { params: true },
  });
  return rows.filter(
    (one) => (one.params as { productId?: string }).productId === productId
  );
};

const storeSweepsWritten = async () => {
  const written = await scratchDb().query.auditEvent.findMany({
    where: { farmId: theFarm().id, entity: "store" },
    columns: { id: true },
  });
  return written.length;
};

describe("the store's notices on a farm with no Manager", () => {
  it("reach the Owner, once", async () => {
    const owner = await as("owner");
    await owner.client.alerts.sweep();
    await owner.client.alerts.sweep();

    expect(await lowStockTold(thePerson("owner").id)).toHaveLength(1);
  });

  it("are not written again on every sweep for a Manager who has left", async () => {
    await as("manager");
    await scratchDb()
      .update(user)
      .set({ disabledAt: new Date(NOW) })
      .where(eq(user.id, thePerson("manager").id));
    const owner = await as("owner", "2091-03-02T05:00:00.000Z");
    await owner.client.alerts.sweep();
    const written = await storeSweepsWritten();
    await owner.client.alerts.sweep();
    await owner.client.alerts.sweep();

    expect(await storeSweepsWritten()).toBe(written);
  });
});
