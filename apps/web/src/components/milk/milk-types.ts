import {
  milkMoneyOf as milkMoneyOfWorths,
  worthOfMilkSent,
} from "@OpenFarm/domain";

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
 *  `worthMoney`, no statement and nothing owed said, and every one of those was priced at the gate. */
interface Priced {
  liters: number;
  pricePerLiterMoney: number | null;
  worthMoney?: number | null;
  receivableMoney?: number;
  buyerStatementId?: string | null;
}

/** What a Dispatch's milk came to — its liters at its price, or what its buyer's statement priced it at — and nothing
 *  while its price is still to follow: the farm's own answer, or worked out the farm's way (`worthOfMilkSent`). */
export const worthOfRow = (row: Priced): number | null =>
  row.worthMoney === undefined
    ? worthOfMilkSent({
        liters: row.liters,
        pricePerLiterMoney: row.pricePerLiterMoney,
        receivableMoney: row.receivableMoney ?? 0,
        buyerStatementId: row.buyerStatementId ?? null,
      })
    : row.worthMoney;

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

/** A day's milk money, and apart from it the liters whose price is still to follow, as the farm adds them. */
export const milkMoneyOf = (
  rows: readonly Priced[]
): { amount: number; litersToFollow: number } =>
  milkMoneyOfWorths(
    rows.map((row) => ({ liters: row.liters, worthMoney: worthOfRow(row) }))
  );
