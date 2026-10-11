import { startOfFarmDay } from "./farm-clock";

const DAY_MS = 86_400_000;
const paisa = (amount: number) => Math.round(amount * 100);

export const supplierBalance = (
  deliveries: readonly {
    priceMoney: number | null;
    paidAtDeliveryMoney: number | null;
  }[],
  payments: readonly { amountMoney: number }[]
) => {
  const purchased = deliveries.reduce(
    (sum, row) => sum + paisa(row.priceMoney ?? 0),
    0
  );
  const paid =
    deliveries.reduce(
      (sum, row) => sum + paisa(row.paidAtDeliveryMoney ?? row.priceMoney ?? 0),
      0
    ) + payments.reduce((sum, row) => sum + paisa(row.amountMoney), 0);
  return {
    purchasedMoney: purchased / 100,
    paidMoney: paid / 100,
    owingMoney: (purchased - paid) / 100,
  };
};

/** Due today remains current; overdue bands use the farm's calendar rather than the browser's timezone. */
export const supplierAging = (
  dueOn: string,
  today: string
): "current" | "1_30" | "31_60" | "61_90" | "over_90" => {
  const days = Math.max(
    0,
    Math.floor(
      (startOfFarmDay(today).getTime() - startOfFarmDay(dueOn).getTime()) /
        DAY_MS
    )
  );
  if (days === 0) {
    return "current";
  }
  if (days <= 30) {
    return "1_30";
  }
  if (days <= 60) {
    return "31_60";
  }
  if (days <= 90) {
    return "61_90";
  }
  return "over_90";
};

/** A correction or a backdated payment may not pay for goods that had not arrived on that day. */
export const supplierPaymentsFit = (
  deliveries: readonly {
    receivedOn: string;
    priceMoney: number | null;
    paidAtDeliveryMoney: number | null;
  }[],
  payments: readonly { paidOn: string; amountMoney: number }[]
) => {
  const days = new Map<string, number>();
  for (const row of deliveries) {
    if (
      (row.paidAtDeliveryMoney ?? 0) < 0 ||
      (row.paidAtDeliveryMoney ?? 0) > (row.priceMoney ?? 0)
    ) {
      return false;
    }
    days.set(
      row.receivedOn,
      (days.get(row.receivedOn) ?? 0) +
        paisa(row.priceMoney ?? 0) -
        paisa(row.paidAtDeliveryMoney ?? 0)
    );
  }
  for (const row of payments) {
    days.set(row.paidOn, (days.get(row.paidOn) ?? 0) - paisa(row.amountMoney));
  }
  let left = 0;
  for (const [, change] of [...days].toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    left += change;
    if (left < 0) {
      return false;
    }
  }
  return true;
};
