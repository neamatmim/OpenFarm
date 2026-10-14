import type { MessageKey } from "@OpenFarm/i18n";

import type { ReceivableTyped } from "./receivable";
import { receivableComplete, receivableSent } from "./receivable";

/**
 * What stops a Dispatch being saved, and the box it is about: its liters, its price, its buyer, and what was paid. Milk
 * sent with its price to follow asks no price and nothing of the money — the buyer's statement sets both (ADR 0030).
 */
export const dispatchProblem = (
  form: { liters: string; price: string; buyerName: string },
  receivable: ReceivableTyped,
  worthMoney: number,
  priceToFollow = false
): { message: MessageKey; at: string } | null => {
  if (!(Number.isFinite(Number(form.liters)) && Number(form.liters) > 0)) {
    return { message: "dispatch.missing.liters", at: "dispatch-liters" };
  }
  const priced = Number.isFinite(Number(form.price)) && Number(form.price) > 0;
  if (!(priceToFollow || priced)) {
    return { message: "dispatch.missing.price", at: "dispatch-price" };
  }
  if (!form.buyerName.trim()) {
    return { message: "dispatch.missing.buyer", at: "dispatch-buyerName" };
  }
  if (!(priceToFollow || receivableComplete(receivable, worthMoney, false))) {
    return {
      message: "dispatch.missing.paid",
      at: "dispatch-receivable-paid-now",
    };
  }
  return null;
};

/** What the farm is sent of a Dispatch's money: its price and what was paid, or only that its price is to follow. */
export const dispatchMoneySent = ({
  price,
  priceToFollow,
  receivable,
}: {
  price: string;
  priceToFollow: boolean;
  receivable: ReceivableTyped;
}):
  | { priceToFollow: true }
  | {
      pricePerLiterMoney: number;
      paidNowMoney?: number;
      promisedBy?: string;
    } =>
  priceToFollow
    ? { priceToFollow: true }
    : { pricePerLiterMoney: Number(price), ...receivableSent(receivable) };
