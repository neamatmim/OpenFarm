import { startOfFarmDay } from "./farm-clock";
import { addDays } from "./fattening";
import type { ReceivableAge } from "./receivable-ages";
import { owingByAge, owingTogether } from "./receivable-ages";
import { supplierBalance } from "./supplier-credit";

/** One Supplier Invoice as it stands in the farm's records: its dates, the loads come against it, and what was paid on
 *  it, each when. */
export interface SupplierBill {
  invoicedOn: string;
  dueOn: string;
  deliveries: readonly {
    receivedOn: Date;
    priceMoney: number | null;
    paidAtDeliveryMoney: number | null;
  }[];
  payments: readonly { paidOn: string; amountMoney: number }[];
}

/**
 * The bills that still owed something at the end of a farm day, each with what it owed (CONTEXT.md: **Owed to
 * Suppliers**): the loads come against it by then, less what was paid at the gate and on the bill by then, read by the
 * same rule as its balance on Feed → Suppliers. A load still to come owes nothing yet, a payment made after the day still
 * owed at it, and a bill dated after the day, or paid up by then, is left out — here and nowhere else.
 */
export const billsOwingAt = <Bill extends SupplierBill>(
  bills: readonly Bill[],
  asOf: string
): (Bill & { owingMoney: number })[] => {
  // The day's end as an instant, worked out once, and every load compared with it.
  const dayEnds = startOfFarmDay(addDays(asOf, 1));
  return bills.flatMap((bill) => {
    // A bill dated after the day owes nothing at it: no load comes before its bill's date (ADR 0026).
    const { owingMoney } = supplierBalance(
      bill.deliveries.filter((one) => one.receivedOn < dayEnds),
      bill.payments.filter((one) => one.paidOn <= asOf)
    );
    return owingMoney > 0 ? [{ ...bill, owingMoney }] : [];
  });
};

/** What the Farm owed its Suppliers at a day's end, by age (ADR 0023, 0026). */
export interface OwedToSuppliers {
  owingMoney: number;
  /** Of it, what was overdue that day: past the day its bill was due. A bill due that day is not yet. */
  overdueMoney: number;
  ages: { age: ReceivableAge; owingMoney: number }[];
}

/**
 * What the Farm still owed its Suppliers at the end of a farm day, from the bills owing then (`billsOwingAt`), each by
 * the days since its date — 0–7, 8–15, 16–30, 31–60, over 60, the ages buyers' Receivables are read in — and how much of
 * it was past its due day.
 */
export const owedToSuppliersByAge = (
  owing: readonly { invoicedOn: string; dueOn: string; owingMoney: number }[],
  asOf: string
): OwedToSuppliers => ({
  owingMoney: owingTogether(owing),
  overdueMoney: owingTogether(owing.filter((one) => one.dueOn < asOf)),
  ages: owingByAge(owing, (one) => one.invoicedOn, asOf),
});
