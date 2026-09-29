import { farmDayOf, startOfFarmDay } from "./farm-clock";
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

/** What a buyer's Baki is for: the cattle he took, or the milk. A payment is for one or the other, and is booked
 *  under that one's Category, so the reports' milk sales and cattle sales stay what they are. */
export const BAKI_KINDS = ["cattle", "milk"] as const;
export type BakiKind = (typeof BAKI_KINDS)[number];

/** One Sale or Dispatch a buyer left owing on. */
export interface BakiItem {
  id: string;
  /** The farm day it left. */
  leftOn: string;
  /** What he still owed as it left. */
  bakiBdt: number;
  promisedBy: string | null;
  /** What the Owner has written off of it, in all; nothing where nothing was. */
  writtenOffBdt?: number;
}

/** One handover of money from him towards it. */
export interface BakiPaymentIn {
  id: string;
  /** The farm day it came. */
  paidOn: string;
  amountBdt: number;
}

/** One item as his payments leave it: what of it they cleared, and what is still owing. */
export interface BakiItemStanding extends BakiItem {
  paidBdt: number;
  owingBdt: number;
  /** What stays written off once his payments are counted: a buyer who pays after all puts a write-off back. */
  writtenOffBdt: number;
}

/** What one payment cleared of one item. */
export interface BakiPart {
  paymentId: string;
  itemId: string;
  amountBdt: number;
}

/** A buyer's Baki of one kind, as his payments leave it. */
export interface BakiStanding {
  items: BakiItemStanding[];
  /** Which payment cleared what, so a payment can say what it was for. */
  parts: BakiPart[];
  owingBdt: number;
  /** What he paid beyond everything he owed, held for his next Baki. */
  creditBdt: number;
  /** What stays written off of it, in all. */
  writtenOffBdt: number;
  /** The day the oldest thing still owing left, or nothing when nothing is. */
  oldestOn: string | null;
  /** The soonest day he promised for what is still owing, or nothing when he promised none. */
  soonestPromise: string | null;
}

/** Oldest first; the same day by id, so two things written in one minute always come in one order. */
const byDayThenId =
  <Row extends { id: string }>(dayOf: (row: Row) => string) =>
  (a: Row, b: Row): number =>
    dayOf(a).localeCompare(dayOf(b)) || a.id.localeCompare(b.id);

/**
 * A buyer's Baki of one kind, cleared oldest first — as a trader's khata is. Each payment, in the order it came, pays
 * off the oldest thing still owing; what is left of it is his credit, which the next thing he takes on Baki uses up
 * first. Worked on read and never stored, so a Correction to an old Sale or payment re-flows without rewriting what a
 * payment was for.
 */
export const bakiStanding = (
  items: readonly BakiItem[],
  payments: readonly BakiPaymentIn[]
): BakiStanding => {
  const owed = items
    .filter((one) => one.bakiBdt > 0)
    .toSorted(byDayThenId((one) => one.leftOn));
  // Two purses per item: what is still open, and what the Owner wrote off. Money pays the open first, everything
  // open before anything written off, and only then puts a write-off back.
  const open = new Map(
    owed.map((one) => [
      one.id,
      roundTaka(Math.max(one.bakiBdt - (one.writtenOffBdt ?? 0), 0)),
    ])
  );
  const writtenOff = new Map(
    owed.map((one) => [one.id, one.writtenOffBdt ?? 0])
  );
  const parts: BakiPart[] = [];
  const spend = (
    paymentId: string,
    purse: Map<string, number>,
    toSpend: number
  ): number => {
    let left = toSpend;
    for (const item of owed) {
      const still = purse.get(item.id) ?? 0;
      if (left <= 0) {
        break;
      }
      if (still > 0) {
        const cleared = roundTaka(Math.min(still, left));
        purse.set(item.id, roundTaka(still - cleared));
        left = roundTaka(left - cleared);
        parts.push({ paymentId, itemId: item.id, amountBdt: cleared });
      }
    }
    return left;
  };
  for (const payment of payments.toSorted(byDayThenId((one) => one.paidOn))) {
    spend(payment.id, writtenOff, spend(payment.id, open, payment.amountBdt));
  }
  const standing = owed.map((item) => {
    const owingBdt = open.get(item.id) ?? 0;
    const stillWrittenOff = writtenOff.get(item.id) ?? 0;
    return {
      ...item,
      paidBdt: roundTaka(item.bakiBdt - owingBdt - stillWrittenOff),
      owingBdt,
      writtenOffBdt: stillWrittenOff,
    };
  });
  const total = (pick: (one: BakiItemStanding) => number) =>
    roundTaka(standing.reduce((sum, one) => sum + pick(one), 0));
  const paidIn = roundTaka(
    payments.reduce((sum, one) => sum + one.amountBdt, 0)
  );
  const clearedBdt = roundTaka(
    parts.reduce((sum, one) => sum + one.amountBdt, 0)
  );
  const stillOwing = standing.filter((one) => one.owingBdt > 0);
  const [soonestPromise] = stillOwing
    .map((one) => one.promisedBy)
    .filter((one) => one !== null)
    .toSorted();
  return {
    items: standing,
    parts,
    owingBdt: total((one) => one.owingBdt),
    creditBdt: roundTaka(paidIn - clearedBdt),
    writtenOffBdt: total((one) => one.writtenOffBdt),
    oldestOn: stillOwing[0]?.leftOn ?? null,
    soonestPromise: soonestPromise ?? null,
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The farm day so many days after another. */
const daysAfter = (day: string, days: number): string =>
  farmDayOf(new Date(startOfFarmDay(day).getTime() + days * DAY_MS));

/**
 * The first farm day a Baki is overdue: the day after the one he promised, since the promised day itself is still his —
 * or, where he promised none, the day after the farm's days for it have run from the day it left (`farm.baki_days`,
 * thirty by default: a milk buyer who pays on a round is not late the morning after).
 */
export const overdueFrom = (
  item: Pick<BakiItem, "leftOn" | "promisedBy">,
  bakiDays: number
): string =>
  item.promisedBy === null
    ? daysAfter(item.leftOn, bakiDays + 1)
    : daysAfter(item.promisedBy, 1);

/** Whether something still owing is overdue today. Paid off, it is not overdue however late it was paid. */
export const isBakiOverdue = (
  item: Pick<BakiItemStanding, "leftOn" | "promisedBy" | "owingBdt">,
  today: string,
  bakiDays: number
): boolean => item.owingBdt > 0 && today >= overdueFrom(item, bakiDays);

/**
 * Whether a buyer was sold to on Baki again while something he owed was already overdue: the Owner hears of it, since
 * it is the farm lending more to somebody who has not paid what is late. Read from what is still owing — payments
 * clear the oldest first, so a Baki still owing today was owing on every day after it left.
 */
export const soldOnBakiWhileOverdue = (
  items: readonly Pick<
    BakiItemStanding,
    "id" | "leftOn" | "promisedBy" | "owingBdt"
  >[],
  bakiDays: number
): boolean => {
  const owing = items.filter((one) => one.owingBdt > 0);
  return owing.some((late) =>
    owing.some(
      (again) =>
        again.id !== late.id && again.leftOn >= overdueFrom(late, bakiDays)
    )
  );
};
