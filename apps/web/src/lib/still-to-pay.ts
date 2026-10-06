import type { VentureState } from "@OpenFarm/domain";
import { hasEnded } from "@OpenFarm/domain";

/** What one paper still owes, as the portal says it: a sum to pay, a sum not paid, or nothing. */
export type Owing =
  | { kind: "to_pay"; amountMoney: number }
  | { kind: "not_paid"; amountMoney: number }
  | null;

/**
 * One Agreement's capital not yet in: what its Units promised, less what the Farm holds on it. To pay while its Venture
 * takes capital; once it takes no more, not paid — their share is by what they paid (the Owner's decision,
 * 2026-10-06). Nothing once it is all in, or for a Venture that has ended.
 */
export const owingOn = (one: {
  promisedMoney: number;
  capitalHeldMoney: number;
  /** `takesCapital` is missing from an answer kept from before the farm said it: read as taking, as then. */
  venture: { state: VentureState; takesCapital?: boolean };
}): Owing => {
  const short = Math.max(0, one.promisedMoney - one.capitalHeldMoney);
  if (hasEnded(one.venture.state) || short <= 0) {
    return null;
  }
  return {
    kind: (one.venture.takesCapital ?? true) ? "to_pay" : "not_paid",
    amountMoney: short,
  };
};
