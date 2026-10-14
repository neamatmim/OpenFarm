import type { orpc } from "@/utils/orpc";

/** One farm day of milk as the farm answers it: the tank, what was handed over, and each Dispatch. */
export type MilkDay = Awaited<ReturnType<typeof orpc.milk.day.call>>;

/** One Dispatch as the day lists it. */
export type Dispatch = MilkDay["dispatches"][number];

/** A farm day a number of days either side of another, both as `YYYY-MM-DD`. */
export const shiftDay = (day: string, days: number): string => {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, "YYYY-MM-DD".length);
};

/** What a Dispatch comes to: its liters at its price, to the paisa. */
export const worthOf = (liters: number, pricePerLiter: number): number =>
  Math.round(liters * pricePerLiter * 100) / 100;

/** A Dispatch as its money is read on the page: a day kept from before the farm said what each came to has no
 *  `worthMoney`, and every one of those was priced at the gate. */
interface Priced {
  liters: number;
  pricePerLiterMoney: number | null;
  worthMoney?: number | null;
}

/** What a Dispatch's milk came to — its liters at its price, or what its buyer's statement priced it at — and nothing
 *  while its price is still to follow. */
export const worthOfRow = (row: Priced): number | null => {
  if (row.worthMoney !== undefined) {
    return row.worthMoney;
  }
  return row.pricePerLiterMoney === null
    ? null
    : worthOf(row.liters, row.pricePerLiterMoney);
};

/** What a liter of it fetched: its price, or what its statement priced it at over its liters; nothing while its price
 *  is to follow. */
export const perLiterOf = (row: Priced): number | null => {
  if (row.pricePerLiterMoney !== null) {
    return row.pricePerLiterMoney;
  }
  const worth = worthOfRow(row);
  return worth === null || row.liters <= 0
    ? null
    : Math.round((worth / row.liters) * 100) / 100;
};

/** A day's milk money, and apart from it the liters whose price is still to follow: never counted at nothing. */
export const milkMoneyOf = (
  rows: readonly Priced[]
): { amount: number; litersToFollow: number } => {
  let amount = 0;
  let litersToFollow = 0;
  for (const row of rows) {
    const worth = worthOfRow(row);
    if (worth === null) {
      litersToFollow += row.liters;
    } else {
      amount += worth;
    }
  }
  return {
    amount: Math.round(amount * 100) / 100,
    litersToFollow: Math.round(litersToFollow * 100) / 100,
  };
};
