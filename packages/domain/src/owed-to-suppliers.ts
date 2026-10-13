import { roundMoney } from "./money";
import type { ReceivableAge } from "./receivable-ages";
import { owingByAge } from "./receivable-ages";

const paisa = (amount: number) => Math.round(amount * 100);

/** What some bills still owe, together. */
const together = (some: readonly { owingMoney: number }[]) =>
  roundMoney(some.reduce((total, one) => total + one.owingMoney, 0));

/**
 * What one Supplier Invoice still owed at the end of a farm day (CONTEXT.md: **Owed to Suppliers**): the feed come
 * against it by then, less what was paid at the gate for it and what was paid on the bill by then. A load still to come
 * owes nothing yet, and a payment made after the day still owed at it. Added in paisa, as the bill's balance is.
 */
export const invoiceOwingOn = (
  invoice: {
    deliveries: readonly {
      receivedOn: string;
      priceMoney: number | null;
      paidAtDeliveryMoney: number | null;
    }[];
    payments: readonly { paidOn: string; amountMoney: number }[];
  },
  asOf: string
): number => {
  const came = invoice.deliveries.filter((one) => one.receivedOn <= asOf);
  const owing =
    came.reduce(
      (sum, one) =>
        sum + paisa(one.priceMoney ?? 0) - paisa(one.paidAtDeliveryMoney ?? 0),
      0
    ) -
    invoice.payments
      .filter((one) => one.paidOn <= asOf)
      .reduce((sum, one) => sum + paisa(one.amountMoney), 0);
  return owing / 100;
};

/** What the Farm owed its Suppliers at a day's end, by age (ADR 0023, 0026). */
export interface OwedToSuppliers {
  owingMoney: number;
  /** Of it, what was overdue that day: past the day its bill was due. A bill due that day is not yet. */
  overdueMoney: number;
  ages: { age: ReceivableAge; owingMoney: number }[];
}

/**
 * What the Farm still owed its Suppliers at the end of a farm day, each bill by the days since its date — 0–7, 8–15,
 * 16–30, 31–60, over 60, the ages buyers' Receivables are read in — and how much of it was past its due day.
 */
export const owedToSuppliersByAge = (
  bills: readonly { invoicedOn: string; dueOn: string; owingMoney: number }[],
  asOf: string
): OwedToSuppliers => {
  const owing = bills.filter((one) => one.owingMoney > 0);
  return {
    owingMoney: together(owing),
    overdueMoney: together(owing.filter((one) => one.dueOn < asOf)),
    ages: owingByAge(owing, (one) => one.invoicedOn, asOf),
  };
};
