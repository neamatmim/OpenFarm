import type { MonthlySum, VentureState } from "@OpenFarm/domain";
import { hasEnded } from "@OpenFarm/domain";

/** What one paper still owes, as the portal says it: a sum to pay, the Monthly Sums fallen due, a sum not paid, or
 *  nothing. */
export type Owing =
  | { kind: "to_pay"; amountMoney: number }
  | {
      kind: "due";
      amountMoney: number;
      missedMoney: number;
      next: MonthlySum | null;
    }
  | { kind: "not_paid"; amountMoney: number }
  | null;

/** Where a paper paid by the month stands today: what has fallen due and is not paid, what of it is missed, and the
 *  next sum still to pay. */
export interface MonthlyStanding {
  dueMoney: number;
  missedMoney: number;
  next: MonthlySum | null;
}

/**
 * One Agreement's capital not yet in: what its Units promised, less what the Farm holds on it. To pay while its Venture
 * takes capital; once it takes no more, not paid — their share is by what they paid (the Owner's decision,
 * 2026-10-06). Nothing once it is all in, or for a Venture that has ended.
 *
 * Paid by the month, only what has fallen due is asked for — the Cattle Part and the Monthly Sums whose 10th has come —
 * with what of it is missed and the next sum after; nothing while every one fallen due is paid, however much of the
 * price is still to come.
 */
export const owingOn = (one: {
  promisedMoney: number;
  capitalHeldMoney: number;
  /** `takesCapital` is missing from an answer kept from before the farm said it: read as taking, as then. */
  venture: { state: VentureState; takesCapital?: boolean };
  /** Null for a Venture paid before buying, or one that takes no more. Missing from an answer kept from before the
   *  portfolio said it: read as the whole sum to pay, as then. */
  monthly?: MonthlyStanding | null;
}): Owing => {
  const short = Math.max(0, one.promisedMoney - one.capitalHeldMoney);
  if (hasEnded(one.venture.state) || short <= 0) {
    return null;
  }
  if (!(one.venture.takesCapital ?? true)) {
    return { kind: "not_paid", amountMoney: short };
  }
  if (one.monthly) {
    return one.monthly.dueMoney > 0
      ? {
          kind: "due",
          amountMoney: one.monthly.dueMoney,
          missedMoney: one.monthly.missedMoney,
          next: one.monthly.next,
        }
      : null;
  }
  return { kind: "to_pay", amountMoney: short };
};
