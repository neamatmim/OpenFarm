import type { Database } from "@OpenFarm/db";
import { and, eq } from "@OpenFarm/db/operators";
import { feedPurchaseOrder } from "@OpenFarm/db/schema/feed";
import { farmDayOf } from "@OpenFarm/domain";
import {
  feedOrderProgress,
  orderByDay,
} from "@OpenFarm/domain/feed-purchasing";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

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
