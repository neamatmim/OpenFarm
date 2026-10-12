import type { MessageKey } from "@OpenFarm/i18n";

import type { ReceivableTyped } from "./receivable";
import { receivableComplete } from "./receivable";

export const dispatchProblem = (
  form: { liters: string; price: string; buyerName: string },
  receivable: ReceivableTyped,
  worthMoney: number
): { message: MessageKey; at: string } | null => {
  if (!(Number.isFinite(Number(form.liters)) && Number(form.liters) > 0)) {
    return { message: "dispatch.missing.liters", at: "dispatch-liters" };
  }
  if (!(Number.isFinite(Number(form.price)) && Number(form.price) > 0)) {
    return { message: "dispatch.missing.price", at: "dispatch-price" };
  }
  if (!form.buyerName.trim()) {
    return { message: "dispatch.missing.buyer", at: "dispatch-buyerName" };
  }
  if (!receivableComplete(receivable, worthMoney, false)) {
    return {
      message: "dispatch.missing.paid",
      at: "dispatch-receivable-paid-now",
    };
  }
  return null;
};
