import type { Database } from "@OpenFarm/db";
import { and, eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { feedPurchaseOrder } from "@OpenFarm/db/schema/feed";
import { farmDayOf } from "@OpenFarm/domain";
import type { FeedEstimateBasis } from "@OpenFarm/domain/feed-estimate";
import {
  feedOrderProgress,
  feedQuoteTotal,
  orderByDay,
} from "@OpenFarm/domain/feed-purchasing";
import type { FeedPlanScenario } from "@OpenFarm/domain/feeding-plan";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { monthlyFeedEstimate } from "./feed-estimate-store";
import { farmFeedingPlan } from "./feeding-plan-store";
import { supplierNamed } from "./supplier-store";
import { seenWhenDone } from "./writes-seen";

/** Who asks for feed, on which farm. */
type Acting = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** A request as it stands now, for the trail. */
export const readOrder = (tx: Tx, id: string) =>
  tx.query.feedPurchaseOrder.findFirst({ where: { id } });

export const purchasingRefused = (refusal: string, message: string): never => {
  throw new ORPCError("BAD_REQUEST", { message, data: { refusal } });
};

export const lockFeedOrder = async (
  tx: Tx,
  farmId: string,
  id: string,
  version?: number
) => {
  const [row] = await tx
    .select()
    .from(feedPurchaseOrder)
    .where(
      and(eq(feedPurchaseOrder.id, id), eq(feedPurchaseOrder.farmId, farmId))
    )
    .for("update");
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such feed purchase request",
    });
  }
  if (version !== undefined && version !== row.version) {
    throw new ORPCError("CONFLICT", {
      message: "This request changed; refresh before continuing",
      data: { refusal: "feed_order_changed" },
    });
  }
  return row;
};

export const feedPurchases = async (
  db: Database | Tx,
  farmId: string,
  now: Date
) => {
  // Active requests must stay visible even when the farm has years of closed purchases.
  const active = await db.query.feedPurchaseOrder.findMany({
    where: { farmId, state: { in: ["requested", "approved", "ordered"] } },
    with: {
      feedItem: true,
      supplier: true,
      assignee: true,
      receipts: { orderBy: { receivedOn: "desc", id: "desc" } },
    },
    orderBy: { neededOn: "asc", requestedAt: "asc" },
  });
  const ended = await db.query.feedPurchaseOrder.findMany({
    where: { farmId, state: { in: ["rejected", "cancelled", "closed"] } },
    with: {
      feedItem: true,
      supplier: true,
      assignee: true,
      receipts: { orderBy: { receivedOn: "desc", id: "desc" } },
    },
    orderBy: { endedAt: "desc", id: "desc" },
    limit: 100,
  });
  const today = farmDayOf(now);
  return [...active, ...ended].map(
    ({ feedItem, supplier, assignee, receipts, ...order }) => {
      const progress = feedOrderProgress(order, receipts);
      const orderBy = orderByDay(
        order.neededOn,
        order.leadDays,
        order.bufferDays
      );
      return {
        ...order,
        quantity: Number(order.quantity),
        ...progress,
        nameBn: feedItem.nameBn,
        nameEn: feedItem.nameEn,
        unit: feedItem.unit,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        assigneeName: assignee.name,
        orderBy,
        orderLate:
          ["requested", "approved"].includes(order.state) && orderBy <= today,
        deliveryLate:
          order.state === "ordered" &&
          progress.remaining > 0 &&
          order.deliveryDueOn !== null &&
          order.deliveryDueOn < today,
        receipts: receipts.map((receipt) => ({
          id: receipt.id,
          quantity: Number(receipt.quantity),
          priceMoney: receipt.priceMoney,
          receivedOn: receipt.receivedOn,
          slipQuantity:
            receipt.slipQuantity === null ? null : Number(receipt.slipQuantity),
        })),
      };
    }
  );
};

/** Called while holding the order lock. Corrections remain authoritative: never cache delivered totals on the order. */
export const validateOrderedDelivery = async (
  tx: Tx,
  order: typeof feedPurchaseOrder.$inferSelect,
  input: {
    feedItemId: string;
    kind: string;
    quantity: number;
    priceMoney?: number;
    receivedOn: string;
  },
  sellerId: string | null
) => {
  if (order.state !== "ordered" || input.kind !== "purchase") {
    purchasingRefused(
      "feed_order_not_ordered",
      "Place the approved order before recording its delivery"
    );
  }
  if (
    order.feedItemId !== input.feedItemId ||
    order.counterpartyId !== sellerId
  ) {
    purchasingRefused(
      "feed_order_wrong_delivery",
      "The feed and seller must match this order"
    );
  }
  if (!order.orderedAt || input.receivedOn < farmDayOf(order.orderedAt)) {
    purchasingRefused(
      "feed_order_delivery_day",
      "A delivery cannot predate its order"
    );
  }
  const receipts = await tx.query.feedIn.findMany({
    where: { farmId: order.farmId, purchaseOrderId: order.id },
  });
  const progress = feedOrderProgress(order, receipts);
  if (input.quantity > progress.remaining) {
    purchasingRefused(
      "feed_order_quantity_limit",
      "This delivery exceeds the approved quantity still outstanding"
    );
  }
  if ((input.priceMoney ?? 0) > progress.budgetLeftMoney) {
    purchasingRefused(
      "feed_order_budget_limit",
      "This delivery exceeds the remaining approved spending limit"
    );
  }
};

export const validateCorrectedDelivery = async (
  tx: Tx,
  order: typeof feedPurchaseOrder.$inferSelect,
  receipt: {
    id: string;
    quantity: string;
    priceMoney: number | null;
    counterpartyId: string | null;
    receivedOn: Date;
  },
  owner: boolean
) => {
  if (receipt.counterpartyId !== order.counterpartyId) {
    purchasingRefused(
      "feed_order_wrong_delivery",
      "A delivery's supplier must match its order"
    );
  }
  if (
    order.orderedAt &&
    farmDayOf(receipt.receivedOn) < farmDayOf(order.orderedAt)
  ) {
    purchasingRefused(
      "feed_order_delivery_day",
      "A delivery cannot predate its order"
    );
  }
  const receipts = await tx.query.feedIn.findMany({
    where: { farmId: order.farmId, purchaseOrderId: order.id },
  });
  const progress = feedOrderProgress(
    order,
    receipts.map((row) => (row.id === receipt.id ? receipt : row))
  );
  // An owner may correct the facts beyond an approval. Its reason and discrepancy remain visible; further
  // deliveries cannot exceed the ceiling until the owner revises it.
  if (!owner && (progress.overBudget || progress.overQuantity)) {
    purchasingRefused(
      "feed_order_budget_limit",
      "Ask the owner to revise approval before increasing this delivery beyond its limits"
    );
  }
};

/** A feed asked for from one supplier, as the Owner or the Manager asks for it. */
export interface FeedOrderRequest {
  id: string;
  feedItemId: string;
  supplier: { name: string; address?: string; phone?: string };
  supplierId?: string;
  assignedTo: string;
  quantity: number;
  unitPriceMoney: number;
  budgetMoney: number;
  neededOn: string;
  leadDays: number;
  bufferDays: number;
  note?: string;
  /** The forecast it was started from, read again on the server as it stands now. */
  forecast?: {
    month: string;
    basis: FeedEstimateBasis | "planning";
    scenario: FeedPlanScenario;
  };
}

/** One feed asked for: refused unless its day, spending limit, feed, assignee and forecast hold, and asked for once
 *  however often the same request arrives. Requests and orders create no stock or money (ADR 0025). */
export const requestFeedOrder = async (
  context: Acting,
  input: FeedOrderRequest
) => {
  const now = context.clock.now();
  return await seenWhenDone(
    context.db.transaction(async (tx) => {
      // Serializes duplicate request ids and supplier creation for this farm.
      await tx
        .select({ id: farm.id })
        .from(farm)
        .where(eq(farm.id, context.farm.id))
        .for("update");
      const existing = await tx.query.feedPurchaseOrder.findFirst({
        where: { id: input.id },
      });
      if (existing) {
        if (
          existing.farmId !== context.farm.id ||
          existing.requestedBy !== context.actor.id
        ) {
          throw new ORPCError("CONFLICT", {
            data: { refusal: "feed_order_changed" },
          });
        }
        return { id: existing.id };
      }
      if (input.neededOn < farmDayOf(now)) {
        purchasingRefused(
          "feed_order_needed_day",
          "Choose today or a later day for the feed to arrive"
        );
      }
      if (
        input.budgetMoney < feedQuoteTotal(input.quantity, input.unitPriceMoney)
      ) {
        purchasingRefused(
          "feed_order_budget_small",
          "The spending limit must cover the quoted quantity and price"
        );
      }
      const feed = await tx.query.feedItem.findFirst({
        where: {
          id: input.feedItemId,
          farmId: context.farm.id,
          retiredAt: { isNull: true },
        },
      });
      if (!feed) {
        throw new ORPCError("NOT_FOUND", {
          message: "Choose a current feed from this farm",
        });
      }
      const assignments = await tx.query.roleAssignment.findMany({
        where: {
          farmId: context.farm.id,
          userId: input.assignedTo,
          role: { in: ["owner", "manager"] },
          revokedAt: { isNull: true },
        },
      });
      if (
        !assignments.some(
          (assignment) => !assignment.expiresAt || assignment.expiresAt > now
        )
      ) {
        purchasingRefused(
          "feed_order_assignee",
          "Assign this request to an active owner or manager of this farm"
        );
      }
      let forecast: Record<string, unknown> | null = null;
      if (input.forecast) {
        const source =
          input.forecast.basis === "planning"
            ? await farmFeedingPlan(
                tx,
                context.farm,
                now,
                input.forecast.month,
                input.forecast.scenario
              )
            : await monthlyFeedEstimate(
                tx,
                context.farm,
                now,
                input.forecast.month,
                input.forecast.basis
              );
        const line = source.lines.find(
          (row) => row.feedItemId === input.feedItemId
        );
        if (!line) {
          purchasingRefused(
            "feed_order_forecast_missing",
            "This feed has no requirement in the selected forecast"
          );
        }
        forecast = { ...input.forecast, asOf: now, line };
      }
      const supplierId = await supplierNamed(
        tx,
        context.farm.id,
        input.supplier,
        now,
        input.supplierId
      );
      const profile = await tx.query.supplierProfile.findFirst({
        where: { counterpartyId: supplierId, farmId: context.farm.id },
      });
      await tx.insert(feedPurchaseOrder).values({
        id: input.id,
        farmId: context.farm.id,
        feedItemId: feed.id,
        counterpartyId: supplierId,
        assignedTo: input.assignedTo,
        quantity: input.quantity.toFixed(1),
        unitPriceMoney: input.unitPriceMoney,
        budgetMoney: input.budgetMoney,
        neededOn: input.neededOn,
        leadDays: input.leadDays,
        bufferDays: input.bufferDays,
        creditDays: profile?.creditDays ?? 0,
        note: input.note || null,
        forecast,
        requestedBy: context.actor.id,
        requestedAt: now,
      });
      await audited(context).recordEvent(tx, {
        entity: "feed_purchase_order",
        entityId: input.id,
        action: "create",
        after: (await readOrder(tx, input.id)) ?? null,
      });
      return { id: input.id };
    })
  );
};
