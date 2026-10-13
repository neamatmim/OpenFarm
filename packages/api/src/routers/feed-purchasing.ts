import { eq } from "@OpenFarm/db/operators";
import { feedPurchaseOrder } from "@OpenFarm/db/schema/feed";
import { farmDayOf } from "@OpenFarm/domain";
import { FEED_ESTIMATE_BASES } from "@OpenFarm/domain/feed-estimate";
import {
  feedOrderProgress,
  feedQuoteTotal,
} from "@OpenFarm/domain/feed-purchasing";
import { FEED_PLAN_SCENARIOS } from "@OpenFarm/domain/feeding-plan";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import {
  feedPurchases,
  lockFeedOrder,
  purchasingRefused,
  readOrder,
  requestFeedOrder,
} from "../feed-purchasing-store";
import { protectedProcedure } from "../index";
import { monthInput } from "../money-inputs";
import { requirePersonalSession, requireRole } from "../roles";
import { quantityInput, sellerInput } from "../stock-store";
import { purchaseOrderPaper } from "../supplier-papers";

const moneyInput = z.number().positive().max(100_000_000).multipleOf(0.01);
const termsInput = {
  quantity: quantityInput.multipleOf(0.1),
  unitPriceMoney: moneyInput,
  budgetMoney: moneyInput,
};
const identity = {
  id: z.string().uuid(),
  version: z.number().int().positive(),
};
const reasonInput = z.string().trim().min(3).max(500);
const runTheStore = protectedProcedure
  .use(requireRole("owner", "manager"))
  .use(requirePersonalSession());
const owner = protectedProcedure
  .use(requireRole("owner"))
  .use(requirePersonalSession());

export const feedPurchasingRouter = {
  paper: runTheStore
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const rows = await feedPurchases(context.db, context.farm.id, now);
      const order = rows.find((row) => row.id === input.id);
      if (!order) {
        throw new ORPCError("NOT_FOUND", { message: "No such purchase order" });
      }
      if (
        !order.approvedAt ||
        !["approved", "ordered", "closed"].includes(order.state)
      ) {
        purchasingRefused(
          "feed_order_needs_approval",
          "Approve this purchase before printing its order"
        );
      }
      const document = purchaseOrderPaper(context.farm, order, now);
      await audited(context).write(
        {
          entity: "feed_purchase_order",
          entityId: order.id,
          action: "export",
          after: { document, version: order.version },
        },
        () => Promise.resolve(null)
      );
      return { document };
    }),
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      feedPurchases(context.db, context.farm.id, context.clock.now())
    ),
  assignees: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const roles = await context.db.query.roleAssignment.findMany({
        where: {
          farmId: context.farm.id,
          role: { in: ["owner", "manager"] },
          revokedAt: { isNull: true },
        },
      });
      const ids = [
        ...new Set(
          roles
            .filter(
              (role) => !role.expiresAt || role.expiresAt > context.clock.now()
            )
            .map((role) => role.userId)
        ),
      ];
      return ids.length
        ? await context.db.query.user.findMany({
            where: { id: { in: ids } },
            columns: { id: true, name: true },
          })
        : [];
    }),
  request: runTheStore
    .input(
      z.object({
        id: z.string().uuid(),
        feedItemId: z.string(),
        supplier: sellerInput,
        supplierId: z.string().optional(),
        assignedTo: z.string(),
        ...termsInput,
        neededOn: farmDay,
        leadDays: z.number().int().min(0).max(90),
        bufferDays: z.number().int().min(0).max(30),
        note: z.string().trim().max(500).optional(),
        forecast: z
          .object({
            month: monthInput,
            basis: z.enum([...FEED_ESTIMATE_BASES, "planning"]),
            scenario: z.enum(FEED_PLAN_SCENARIOS).default("expected"),
          })
          .optional(),
      })
    )
    .handler(({ context, input }) => requestFeedOrder(context, input)),
  approve: owner
    .input(
      z.object({ ...identity, ...termsInput, reason: reasonInput.optional() })
    )
    .handler(
      async ({ context, input }) =>
        await audited(context).write(
          {
            entity: "feed_purchase_order",
            entityId: input.id,
            action: "update",
            reason: input.reason,
            before: (tx) =>
              lockFeedOrder(tx, context.farm.id, input.id, input.version),
            after: async (tx) => (await readOrder(tx, input.id)) ?? null,
          },
          async (tx) => {
            const order = await lockFeedOrder(
              tx,
              context.farm.id,
              input.id,
              input.version
            );
            if (order.state !== "requested" && !input.reason) {
              purchasingRefused(
                "feed_order_reason",
                "Give a reason for changing an existing approval"
              );
            }
            const receipts = await tx.query.feedIn.findMany({
              where: { farmId: context.farm.id, purchaseOrderId: order.id },
            });
            const progress = feedOrderProgress(order, receipts);
            const historicalOverrun =
              ["closed", "cancelled"].includes(order.state) &&
              (progress.overBudget || progress.overQuantity);
            if (
              !["requested", "approved", "ordered"].includes(order.state) &&
              !historicalOverrun
            ) {
              purchasingRefused(
                "feed_order_terminal",
                "Only active purchases or historical delivery overruns can have their approval revised"
              );
            }
            if (
              input.quantity < progress.received ||
              input.budgetMoney < progress.spentMoney ||
              input.budgetMoney <
                feedQuoteTotal(input.quantity, input.unitPriceMoney)
            ) {
              purchasingRefused(
                "feed_order_budget_small",
                "The approval must cover its quote and all deliveries already recorded"
              );
            }
            await tx
              .update(feedPurchaseOrder)
              .set({
                quantity: input.quantity.toFixed(1),
                unitPriceMoney: input.unitPriceMoney,
                budgetMoney: input.budgetMoney,
                state: order.state === "requested" ? "approved" : order.state,
                approvedBy: context.actor.id,
                approvedAt: context.clock.now(),
                version: order.version + 1,
              })
              .where(eq(feedPurchaseOrder.id, order.id));
            return { id: order.id };
          }
        )
    ),
  place: runTheStore
    .input(
      z.object({
        ...identity,
        orderReference: z.string().trim().min(1).max(120),
        deliveryDueOn: farmDay,
      })
    )
    .handler(
      async ({ context, input }) =>
        await audited(context).write(
          {
            entity: "feed_purchase_order",
            entityId: input.id,
            action: "update",
            before: (tx) =>
              lockFeedOrder(tx, context.farm.id, input.id, input.version),
            after: async (tx) => (await readOrder(tx, input.id)) ?? null,
          },
          async (tx) => {
            const row = await lockFeedOrder(
              tx,
              context.farm.id,
              input.id,
              input.version
            );
            if (row.state !== "approved") {
              purchasingRefused(
                "feed_order_needs_approval",
                "Only an approved request can be ordered"
              );
            }
            if (input.deliveryDueOn < farmDayOf(context.clock.now())) {
              purchasingRefused(
                "feed_order_needed_day",
                "Choose today or a later delivery day"
              );
            }
            await tx
              .update(feedPurchaseOrder)
              .set({
                state: "ordered",
                orderReference: input.orderReference,
                deliveryDueOn: input.deliveryDueOn,
                orderedBy: context.actor.id,
                orderedAt: context.clock.now(),
                version: row.version + 1,
              })
              .where(eq(feedPurchaseOrder.id, row.id));
            return { id: row.id };
          }
        )
    ),
  end: runTheStore
    .input(
      z.object({
        ...identity,
        outcome: z.enum(["rejected", "cancelled", "closed"]),
        reason: reasonInput,
      })
    )
    .handler(
      async ({ context, input }) =>
        await audited(context).write(
          {
            entity: "feed_purchase_order",
            entityId: input.id,
            action: "update",
            reason: input.reason,
            before: (tx) =>
              lockFeedOrder(tx, context.farm.id, input.id, input.version),
            after: async (tx) => (await readOrder(tx, input.id)) ?? null,
          },
          async (tx) => {
            const row = await lockFeedOrder(
              tx,
              context.farm.id,
              input.id,
              input.version
            );
            if (!["requested", "approved", "ordered"].includes(row.state)) {
              purchasingRefused(
                "feed_order_terminal",
                "This request is already closed"
              );
            }
            if (
              (input.outcome === "rejected" && row.state !== "requested") ||
              (input.outcome === "closed" && row.state !== "ordered")
            ) {
              purchasingRefused(
                "feed_order_terminal",
                "Choose an outcome appropriate to this request's stage"
              );
            }
            if (
              !context.roles.includes("owner") &&
              !(
                row.state === "requested" &&
                input.outcome === "cancelled" &&
                row.requestedBy === context.actor.id
              )
            ) {
              throw new ORPCError("FORBIDDEN", {
                data: { refusal: "owner_only" },
              });
            }
            await tx
              .update(feedPurchaseOrder)
              .set({
                state: input.outcome,
                endReason: input.reason,
                endedBy: context.actor.id,
                endedAt: context.clock.now(),
                version: row.version + 1,
              })
              .where(eq(feedPurchaseOrder.id, row.id));
            return { id: row.id };
          }
        )
    ),
};
