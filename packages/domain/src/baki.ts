import { roundTaka } from "./money";

/**
 * **Baki** at the gate: what a buyer still owed for a Sale or a Dispatch when it left, and the day he promised to pay
 * it by. Only what was paid is money on the day; the rest is Baki until it is paid or written off.
 *
 * Pure, so the Sale and the Dispatch — and each one's Correction — ask the same question the same way.
 */

/** Why the farm will not write down what a buyer owed as it was given. */
export const BAKI_REFUSALS = [
  // More paid than the animal or the milk came to: the buyer is not owed change by the farm's books.
  "paid_more_than_price",
  // Something left owing with no day to pay it by, where the record asks for one: a trader promises a day.
  "baki_needs_a_promise",
  // A promise to pay by a day before the animal or the milk had even left.
  "promise_before_it_left",
] as const;
export type BakiRefusal = (typeof BAKI_REFUSALS)[number];

/** What a buyer still owed when it left, and the farm day ("YYYY-MM-DD") he promised to pay it by. */
export interface BakiAtTheGate {
  bakiBdt: number;
  /** Always a day when something is owed and a promise was given; never a day when nothing is owed. */
  promisedBy: string | null;
}

/** Either what is owed, or why it could not be written down. */
export type BakiOutcome = BakiAtTheGate | { refusal: BakiRefusal };

/** Whether the farm refused what it was given. */
export const isBakiRefusal = (
  outcome: BakiOutcome
): outcome is { refusal: BakiRefusal } => "refusal" in outcome;

/** What was paid when it left: what it came to, less what was still owed. */
export const paidAtTheGate = (worthBdt: number, bakiBdt: number): number =>
  roundTaka(worthBdt - bakiBdt);

/** The checks every Baki passes, whichever way it was worked out. */
const checked = ({
  bakiBdt,
  promisedBy,
  leftOn,
  promiseRequired,
}: {
  bakiBdt: number;
  promisedBy: string | null;
  leftOn: string;
  promiseRequired: boolean;
}): BakiOutcome => {
  if (bakiBdt < 0) {
    return { refusal: "paid_more_than_price" };
  }
  if (bakiBdt === 0) {
    // Paid in full owes nothing, and a promise to pay nothing is not a promise.
    return { bakiBdt: 0, promisedBy: null };
  }
  if (promisedBy === null) {
    return promiseRequired
      ? { refusal: "baki_needs_a_promise" }
      : { bakiBdt, promisedBy: null };
  }
  if (promisedBy < leftOn) {
    return { refusal: "promise_before_it_left" };
  }
  return { bakiBdt, promisedBy };
};

/**
 * What a buyer owed as it left: what it came to, less what he paid there and then. Nothing said of what he paid, he
 * paid it all — every Sale and Dispatch before Baki was written down was paid in full.
 */
export const bakiAtTheGate = ({
  worthBdt,
  paidNowBdt,
  promisedBy,
  leftOn,
  promiseRequired,
}: {
  /** What the animal or the milk came to: a Sale's price, a Dispatch's litres at its price. */
  worthBdt: number;
  paidNowBdt?: number;
  promisedBy?: string | null;
  /** The farm day it left. */
  leftOn: string;
  /** A Sale asks for a promised day; a Dispatch does not, since a milk buyer often pays on a round. */
  promiseRequired: boolean;
}): BakiOutcome =>
  checked({
    bakiBdt: paidNowBdt === undefined ? 0 : roundTaka(worthBdt - paidNowBdt),
    promisedBy: promisedBy ?? null,
    leftOn,
    promiseRequired,
  });

/**
 * What a buyer owed as it left, put right.
 *
 * What was paid is the fact a Correction to the price must not move: the cash handed over at the gate is what it was.
 * So a buyer who paid in full stays paid in full at the corrected price — the price was mistyped, not the handshake —
 * and a buyer who paid part keeps what he paid, and owes the difference. Say what he paid, and that is what he paid.
 */
export const bakiPutRight = ({
  before,
  worthBdt,
  paidNowBdt,
  promisedBy,
  leftOn,
  promiseRequired,
}: {
  /** What it came to and what was owed, as the record stood. */
  before: { worthBdt: number; bakiBdt: number; promisedBy: string | null };
  /** What it comes to now: the corrected price, or the old one where the price was not corrected. */
  worthBdt: number;
  /** What he paid, when the Correction says; left out, what he paid stands. */
  paidNowBdt?: number;
  /** The day he promised, when the Correction says; null takes a promise away, left out keeps it. */
  promisedBy?: string | null;
  leftOn: string;
  promiseRequired: boolean;
}): BakiOutcome => {
  const paidInFull = before.bakiBdt === 0;
  const paid =
    paidNowBdt ??
    (paidInFull ? worthBdt : paidAtTheGate(before.worthBdt, before.bakiBdt));
  return checked({
    bakiBdt: roundTaka(worthBdt - paid),
    promisedBy: promisedBy === undefined ? before.promisedBy : promisedBy,
    leftOn,
    promiseRequired,
  });
};
