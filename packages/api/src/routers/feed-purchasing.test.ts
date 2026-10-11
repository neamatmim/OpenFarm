import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { farm as farmTable } from "@OpenFarm/db/schema/farm";
import { feedPurchaseOrder } from "@OpenFarm/db/schema/feed";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const NOW = "2068-02-02T04:00:00.000Z";
const suffix = `purchases-${Date.now()}`;
const as = (role: "owner" | "manager" | "staff" | "vet" | null, now = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(now) });
let world: { branId: string; otherId: string; managerId: string };
beforeAll(async () => {
  const { client, context } = await as("manager");
  const bran = await client.feed.items.create({
    name: { bn: `ভুসি ${suffix}`, en: "Bran" },
  });
  const other = await client.feed.items.create({
    name: { bn: `ঘাস ${suffix}`, en: "Grass" },
  });
  world = {
    branId: bran.id,
    otherId: other.id,
    managerId: context.actor?.id ?? "",
  };
});
const terms = { quantity: 100, unitPriceMoney: 40, budgetMoney: 4000 };
const requestInput = () => ({
  id: uuidv7(),
  feedItemId: world.branId,
  supplier: { name: suffix, phone: "01700000000" },
  assignedTo: world.managerId,
  ...terms,
  neededOn: "2068-02-20",
  leadDays: 5,
  bufferDays: 2,
});
const requested = async () => {
  const manager = await as("manager");
  const owner = await as("owner");
  const input = requestInput();
  await manager.client.feedPurchasing.request(input);
  return { ...manager, owner: owner.client, input };
};
const ordered = async () => {
  const request = await requested();
  await request.owner.feedPurchasing.approve({
    id: request.input.id,
    version: 1,
    ...terms,
  });
  await request.client.feedPurchasing.place({
    id: request.input.id,
    version: 2,
    orderReference: `PO-${request.input.id}`,
    deliveryDueOn: "2068-02-10",
  });
  return request;
};
const delivery = (orderId: string, quantity = 60, priceMoney = 2400) => ({
  id: uuidv7(),
  purchaseOrderId: orderId,
  feedItemId: world.branId,
  kind: "purchase" as const,
  quantity,
  priceMoney,
  seller: { name: suffix },
  receivedOn: "2068-02-02",
});
const read = async (id: string) => {
  const { client } = await as("manager");
  const orders = await client.feedPurchasing.list();
  return orders.find((row) => row.id === id);
};

describe("feed purchase requests and deliveries", () => {
  it("uses exact fractional quote rounding for the approval ceiling", async () => {
    const { client } = await as("manager");
    const input = {
      ...requestInput(),
      quantity: 17.3,
      unitPriceMoney: 10.45,
      budgetMoney: 180.79,
    };
    await client.feedPurchasing.request(input);
    expect(await read(input.id)).toMatchObject({
      quantity: 17.3,
      budgetMoney: 180.79,
    });
    const owner = await as("owner");
    const approvedTerms = {
      quantity: 17.3,
      unitPriceMoney: 10.45,
      budgetMoney: 180.79,
    };
    await owner.client.feedPurchasing.approve({
      id: input.id,
      version: 1,
      ...approvedTerms,
    });
    await client.feedPurchasing.place({
      id: input.id,
      version: 2,
      orderReference: "Fractional quote",
      deliveryDueOn: "2068-02-10",
    });
    await client.stock.receive(delivery(input.id, 17.3, 180.79));
    expect(await read(input.id)).toMatchObject({
      received: 17.3,
      remaining: 0,
      spentMoney: 180.79,
      budgetLeftMoney: 0,
    });
    await expect(
      client.feedPurchasing.request({
        ...input,
        id: uuidv7(),
        budgetMoney: 180.78,
      })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_budget_small" } });
  });
  it("validates requests and keeps retries idempotent after the original need day", async () => {
    const { client, context } = await as("manager");
    const input = requestInput();
    await expect(
      client.feedPurchasing.request({ ...input, neededOn: "2068-02-01" })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_needed_day" } });
    await expect(
      client.feedPurchasing.request({ ...input, assignedTo: "not-a-manager" })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_assignee" } });
    await expect(
      client.feedPurchasing.request({ ...input, quantity: 1.15 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.feedPurchasing.request({ ...input, budgetMoney: 3999.99 })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_budget_small" } });
    await client.feedPurchasing.request(input);
    const later = await as("manager", "2068-03-01T04:00:00.000Z");
    expect(await later.client.feedPurchasing.request(input)).toEqual({
      id: input.id,
    });
    expect(
      await context.db.query.auditEvent.findMany({
        where: { entity: "feed_purchase_order", entityId: input.id },
      })
    ).toHaveLength(1);
  });

  it("keeps a server-read forecast snapshot from either monthly basis or the animal feeding plan", async () => {
    const { client } = await as("manager");
    const shed = await client.sheds.create({
      name: `Purchase forecast ${suffix}`,
    });
    const pen = await client.sheds.pens.create({
      shedId: shed.id,
      name: suffix,
      quarantine: true,
    });
    const ration = await client.feed.rations.save({
      name: { bn: `রেশন ${suffix}` },
      band: { fromKg: 100, toKg: null },
      expectedGain: { lowKg: 0.5, highKg: 1 },
      items: [{ feedItemId: world.otherId, kgPerAnimalPerDay: 5 }],
    });
    await client.feed.rations.assign({
      penId: pen.id,
      rationId: ration.rationId,
    });
    const bull = await client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: suffix },
      purchasePriceMoney: 50_000,
      weightKg: 150,
      estimatedAgeMonths: 18,
      arrivedAt: new Date(NOW),
      targetWindowStart: "2068-11-01",
      targetWindowEnd: "2068-11-05",
    });
    const input = {
      ...requestInput(),
      feedItemId: world.otherId,
      forecast: { month: "2068-02", basis: "rations" as const },
    };
    await client.feedPurchasing.request(input);
    const current = await read(input.id);
    expect(current?.forecast).toMatchObject({
      basis: "rations",
      month: "2068-02",
      line: { feedItemId: world.otherId, required: 145, toBuy: 145 },
    });
    await client.feedingPlans.save({
      tagNumber: bull.tagNumber,
      previousPlanId: null,
      startDay: "2068-02-02",
      startWeightKg: 150,
      saleDay: "2068-11-01",
      targetWeightKg: 300,
      adaptationDays: 0,
      transitionDays: 7,
      reviewDays: 28,
      reservePercent: 10,
      arrivalRationId: null,
      stageRationIds: [ration.rationId],
    });
    const planningInput = {
      ...input,
      id: uuidv7(),
      forecast: {
        month: "2068-02",
        basis: "planning" as const,
        scenario: "slow" as const,
      },
    };
    await client.feedPurchasing.request(planningInput);
    const savedPlan = await read(planningInput.id);
    expect(savedPlan?.forecast).toMatchObject({
      basis: "planning",
      scenario: "slow",
      line: { feedItemId: world.otherId },
    });
    await client.stock.receive({
      id: uuidv7(),
      feedItemId: world.otherId,
      kind: "purchase",
      quantity: 20,
      priceMoney: 800,
      seller: { name: suffix },
      receivedOn: "2068-02-02",
    });
    const unchanged = await read(input.id);
    expect(unchanged?.forecast).toEqual(current?.forecast);
  });

  it("serializes corrections with deliveries and cannot spend the same remaining allowance", async () => {
    const { client, input } = await ordered();
    const receipt = delivery(input.id);
    await client.stock.receive(receipt);
    const results = await Promise.allSettled([
      client.stock.correct({
        id: receipt.id,
        reason: "Correct actual quantity",
        changes: {
          quantity: { from: 60, to: 70 },
          priceMoney: { from: 2400, to: 2800 },
        },
      }),
      client.stock.receive(delivery(input.id, 40, 1600)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const progress = await read(input.id);
    expect(progress?.received).toBeLessThanOrEqual(100);
    expect(progress?.spentMoney).toBeLessThanOrEqual(4000);
  });

  it("retains factual owner corrections above a closed approval and reviews them without reopening", async () => {
    const { owner, client, input } = await ordered();
    const receipt = delivery(input.id, 100, 4000);
    await client.stock.receive(receipt);
    await owner.feedPurchasing.end({
      id: input.id,
      version: 3,
      outcome: "closed",
      reason: "Delivery completed",
    });
    await owner.stock.correct({
      id: receipt.id,
      reason: "Actual invoice corrected",
      changes: { priceMoney: { from: 4000, to: 4200 } },
    });
    expect(await read(input.id)).toMatchObject({
      state: "closed",
      spentMoney: 4200,
      overBudget: true,
    });
    await owner.feedPurchasing.approve({
      id: input.id,
      version: 4,
      quantity: 100,
      unitPriceMoney: 40,
      budgetMoney: 4200,
      reason: "Reviewed actual delivery charge",
    });
    expect(await read(input.id)).toMatchObject({
      state: "closed",
      overBudget: false,
      spentMoney: 4200,
    });
    await expect(
      client.stock.receive(delivery(input.id, 1, 40))
    ).rejects.toMatchObject({ data: { refusal: "feed_order_not_ordered" } });
  });

  it("deduplicates simultaneous requests without creating stock or spending", async () => {
    const { client, context } = await as("manager");
    const input = requestInput();
    const receiptsBefore = await context.db.query.feedIn.findMany({
      where: { farmId: context.farm?.id, feedItemId: world.branId },
    });
    const results = await Promise.all([
      client.feedPurchasing.request(input),
      client.feedPurchasing.request(input),
    ]);
    expect(results).toEqual([{ id: input.id }, { id: input.id }]);
    expect(
      await context.db.query.auditEvent.findMany({
        where: { entity: "feed_purchase_order", entityId: input.id },
      })
    ).toHaveLength(1);
    expect(
      await context.db.query.feedIn.findMany({
        where: { farmId: context.farm?.id, feedItemId: world.branId },
      })
    ).toHaveLength(receiptsBefore.length);
    expect(await read(input.id)).toMatchObject({
      state: "requested",
      orderBy: "2068-02-13",
      received: 0,
      spentMoney: 0,
    });
  });

  it("requires owner approval and rejects unauthorized roles", async () => {
    const { client, input } = await requested();
    await expect(
      client.feedPurchasing.approve({ id: input.id, version: 1, ...terms })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      client.feedPurchasing.place({
        id: input.id,
        version: 1,
        orderReference: "Unapproved",
        deliveryDueOn: "2068-02-10",
      })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_needs_approval" } });
    await expect(
      client.stock.receive(delivery(input.id))
    ).rejects.toMatchObject({ data: { refusal: "feed_order_not_ordered" } });
    for (const role of ["staff", "vet", null] as const) {
      // oxlint-disable-next-line no-await-in-loop -- exercise each distinct permission boundary
      const restricted = await as(role);
      // oxlint-disable-next-line no-await-in-loop -- each role must fail independently
      await expect(
        restricted.client.feedPurchasing.list()
      ).rejects.toMatchObject({
        code: role === null ? "UNAUTHORIZED" : "FORBIDDEN",
      });
    }
  });

  it("books actual scale quantity and one money event per partial delivery", async () => {
    const { client, context, input } = await ordered();
    const receipt = delivery(input.id);
    await client.stock.receive({ ...receipt, weighed: 58 });
    expect(await read(input.id)).toMatchObject({
      state: "ordered",
      received: 58,
      remaining: 42,
      spentMoney: 2400,
      budgetLeftMoney: 1600,
    });
    expect(
      await context.db.query.feedIn.findFirst({ where: { id: receipt.id } })
    ).toMatchObject({
      quantity: "58.0",
      slipQuantity: "60.0",
      purchaseOrderId: input.id,
    });
    expect(
      await context.db.query.moneyEvent.findMany({
        where: {
          farmId: context.farm?.id,
          source: "feed_in",
          sourceId: receipt.id,
        },
      })
    ).toMatchObject([{ amountMoney: 2400, direction: "out" }]);
    await expect(
      client.stock.receive(delivery(input.id, 43, 1500))
    ).rejects.toMatchObject({ data: { refusal: "feed_order_quantity_limit" } });
    await expect(
      client.stock.receive(delivery(input.id, 42, 1600.01))
    ).rejects.toMatchObject({ data: { refusal: "feed_order_budget_limit" } });
    await client.stock.receive(delivery(input.id, 42, 1600));
    expect(await read(input.id)).toMatchObject({
      received: 100,
      remaining: 0,
      spentMoney: 4000,
      budgetLeftMoney: 0,
    });
  });

  it("deduplicates competing taps and serializes deliveries against both ceilings", async () => {
    const { client, context, input } = await ordered();
    const receipt = delivery(input.id);
    await Promise.all([
      client.stock.receive(receipt),
      client.stock.receive(receipt),
    ]);
    expect(
      await context.db.query.feedIn.findMany({
        where: { purchaseOrderId: input.id },
      })
    ).toHaveLength(1);
    expect(
      await context.db.query.auditEvent.findMany({
        where: { entity: "feed_in", entityId: receipt.id },
      })
    ).toHaveLength(1);
    const competing = await ordered();
    const results = await Promise.allSettled([
      competing.client.stock.receive(delivery(competing.input.id)),
      competing.client.stock.receive(delivery(competing.input.id)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(await read(competing.input.id)).toMatchObject({
      received: 60,
      spentMoney: 2400,
      remaining: 40,
    });
  });

  it("preserves approval history, refuses stale changes and requires reasons for revisions", async () => {
    const { client, owner, context, input } = await ordered();
    await client.stock.receive(delivery(input.id));
    await expect(
      owner.feedPurchasing.approve({ id: input.id, version: 3, ...terms })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_reason" } });
    await expect(
      owner.feedPurchasing.approve({
        id: input.id,
        version: 3,
        quantity: 50,
        unitPriceMoney: 40,
        budgetMoney: 4000,
        reason: "Wrong quantity",
      })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_budget_small" } });
    await owner.feedPurchasing.approve({
      id: input.id,
      version: 3,
      quantity: 120,
      unitPriceMoney: 40,
      budgetMoney: 5000,
      reason: "More feed needed",
    });
    await expect(
      owner.feedPurchasing.approve({
        id: input.id,
        version: 3,
        ...terms,
        reason: "Stale screen",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await read(input.id)).toMatchObject({
      quantity: 120,
      state: "ordered",
      budgetLeftMoney: 2600,
    });
    const history = await context.db.query.auditEvent.findMany({
      where: { entity: "feed_purchase_order", entityId: input.id },
      orderBy: { receivedAt: "desc", id: "desc" },
    });
    expect(history[0]).toMatchObject({
      before: { quantity: "100.0", budgetMoney: 4000 },
      after: { quantity: "120.0", budgetMoney: 5000 },
      reason: "More feed needed",
      roleUsed: "owner",
    });
  });

  it("cancels only the remainder and retains deliveries and spending", async () => {
    const { client, owner, context, input } = await ordered();
    const receipt = delivery(input.id);
    await client.stock.receive(receipt);
    await expect(
      client.feedPurchasing.end({
        id: input.id,
        version: 3,
        outcome: "cancelled",
        reason: "No more needed",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.feedPurchasing.end({
      id: input.id,
      version: 3,
      outcome: "cancelled",
      reason: "Supplier cannot finish",
    });
    expect(await read(input.id)).toMatchObject({
      state: "cancelled",
      received: 60,
      remaining: 40,
      spentMoney: 2400,
    });
    expect(
      await context.db.query.feedIn.findFirst({ where: { id: receipt.id } })
    ).toBeDefined();
    await expect(
      client.stock.receive(delivery(input.id, 40, 1600))
    ).rejects.toMatchObject({ data: { refusal: "feed_order_not_ordered" } });
  });

  it("updates progress when an arrival is corrected or voided", async () => {
    const { client, context, input } = await ordered();
    const receipt = delivery(input.id);
    await client.stock.receive(receipt);
    await client.stock.correct({
      id: receipt.id,
      reason: "Scale reading corrected",
      changes: {
        quantity: { from: 60, to: 55 },
        priceMoney: { from: 2400, to: 2200 },
      },
    });
    expect(await read(input.id)).toMatchObject({
      received: 55,
      remaining: 45,
      spentMoney: 2200,
      budgetLeftMoney: 1800,
    });
    await client.stock.correct({
      id: receipt.id,
      reason: "Duplicate delivery entered",
      changes: { voided: { from: false, to: true } },
    });
    expect(await read(input.id)).toMatchObject({
      received: 0,
      remaining: 100,
      spentMoney: 0,
    });
    expect(
      await context.db.query.moneyEvent.findMany({
        where: { source: "feed_in", sourceId: receipt.id },
      })
    ).toHaveLength(0);
  });

  it("refuses unrelated feed, supplier, early days and foreign orders", async () => {
    const { client, owner, context, input } = await ordered();
    await expect(
      client.stock.receive({ ...delivery(input.id), feedItemId: world.otherId })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_wrong_delivery" } });
    await expect(
      client.stock.receive({
        ...delivery(input.id),
        seller: { name: "Someone else" },
      })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_wrong_delivery" } });
    await expect(
      client.stock.receive({ ...delivery(input.id), receivedOn: "2068-02-01" })
    ).rejects.toMatchObject({ data: { refusal: "feed_order_delivery_day" } });
    const currentFarm = await context.db.query.farm.findFirst({
      where: { id: context.farm?.id },
    });
    const currentOrder = await context.db.query.feedPurchaseOrder.findFirst({
      where: { id: input.id },
    });
    if (!currentFarm || !currentOrder) {
      throw new Error("Expected test fixtures");
    }
    const foreignId = uuidv7();
    const foreignFarmId = uuidv7();
    await context.db
      .insert(farmTable)
      .values({ ...currentFarm, id: foreignFarmId });
    await context.db
      .insert(feedPurchaseOrder)
      .values({ ...currentOrder, id: foreignId, farmId: foreignFarmId });
    const visible = await client.feedPurchasing.list();
    expect(visible.some((row) => row.id === foreignId)).toBe(false);
    await expect(
      owner.feedPurchasing.approve({
        id: foreignId,
        version: 3,
        ...terms,
        reason: "Wrong farm",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      client.stock.receive(delivery(foreignId))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await context.db
      .delete(feedPurchaseOrder)
      .where(eq(feedPurchaseOrder.id, foreignId));
  });

  it("reports ordering and delivery deadlines without counting already completed orders", async () => {
    const { input } = await requested();
    const late = await as("manager", "2068-02-13T04:00:00.000Z");
    const lateOrders = await late.client.feedPurchasing.list();
    expect(lateOrders.find((row) => row.id === input.id)?.orderLate).toBe(true);
    const placed = await ordered();
    const afterDue = await as("manager", "2068-02-11T04:00:00.000Z");
    const overdue = await afterDue.client.feedPurchasing.list();
    expect(
      overdue.find((row) => row.id === placed.input.id)?.deliveryLate
    ).toBe(true);
    await placed.client.stock.receive(delivery(placed.input.id, 100, 4000));
    const delivered = await afterDue.client.feedPurchasing.list();
    expect(
      delivered.find((row) => row.id === placed.input.id)?.deliveryLate
    ).toBe(false);
  });
});
