import { addDays } from "./fattening";
import { roundMoney } from "./money";

export const FEED_ORDER_STATES = [
  "requested",
  "approved",
  "ordered",
  "rejected",
  "cancelled",
  "closed",
] as const;
export type FeedOrderState = (typeof FEED_ORDER_STATES)[number];

/** Integer tenths × paisa matches PostgreSQL's numeric rounding, including half a paisa. */
export const feedQuoteTotal = (
  quantity: number,
  unitPriceMoney: number
): number =>
  Math.round(
    (Math.round(quantity * 10) * Math.round(unitPriceMoney * 100)) / 10
  ) / 100;

export const orderByDay = (
  neededOn: string,
  leadDays: number,
  bufferDays: number
): string => addDays(neededOn, -(leadDays + bufferDays));

export const feedOrderProgress = (
  order: { quantity: string | number; budgetMoney: number },
  receipts: readonly { quantity: string | number; priceMoney: number | null }[]
) => {
  const received =
    Math.round(
      receipts.reduce((sum, row) => sum + Number(row.quantity), 0) * 10
    ) / 10;
  const spentMoney = roundMoney(
    receipts.reduce((sum, row) => sum + (row.priceMoney ?? 0), 0)
  );
  return {
    received,
    remaining: Math.max(
      0,
      Math.round((Number(order.quantity) - received) * 10) / 10
    ),
    spentMoney,
    budgetLeftMoney: roundMoney(order.budgetMoney - spentMoney),
    overQuantity: received > Number(order.quantity),
    overBudget: spentMoney > order.budgetMoney,
  };
};

/** Only orders placed with a supplier count as incoming feed. Requests and approvals reserve nothing. */
export const incomingFeedQuantity = (
  orders: readonly {
    state: FeedOrderState;
    deliveryDueOn: string | null;
    remaining: number;
    deliveryLate?: boolean;
    overBudget?: boolean;
  }[],
  neededOn: string
): number =>
  Math.round(
    orders.reduce(
      (sum, order) =>
        sum +
        (order.state === "ordered" &&
        !order.deliveryLate &&
        !order.overBudget &&
        order.deliveryDueOn !== null &&
        order.deliveryDueOn <= neededOn
          ? order.remaining
          : 0),
      0
    ) * 10
  ) / 10;
