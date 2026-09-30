/** How money changed hands. Shared with the client, which offers each; mirrored from the database's
 *  own list, which this package does not depend on. */
export const PAYMENT_METHODS = ["cash", "bkash", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type MoneyApproval = "not_needed" | "awaiting" | "approved";

/** What an approval approves: how much, to or from whom, under what Category, and whose money it was. */
export interface ApprovedTerms {
  amountBdt: number;
  counterpartyId: string | null;
  categoryId: string;
  /** The Purse: null for the Farm's own money, or the Venture whose it was. */
  purseVentureId?: string | null;
}

const sameTerms = (a: ApprovedTerms, b: ApprovedTerms): boolean =>
  a.amountBdt === b.amountBdt &&
  a.counterpartyId === b.counterpartyId &&
  a.categoryId === b.categoryId &&
  (a.purseVentureId ?? null) === (b.purseVentureId ?? null);

/**
 * Where a Money Event stands with the Owner once its terms are known.
 *
 * Over the Approval Threshold, money the Owner did not enter waits for the Owner; at or under it, or
 * entered by the Owner, it waits for nobody. An approval is of the terms the Owner read — the amount, who
 * it went to or came from, and its Category — so a Money Event the Owner approved keeps its approval while
 * those stay as they were, and waits again when a Correction changes any of them — whose money it was
 * included, because approving the farm's eighty thousand taka is not approving an Investor's.
 */
export const approvalOf = ({
  terms,
  thresholdBdt,
  enteredByTheOwner,
  before,
}: {
  terms: ApprovedTerms;
  thresholdBdt: number;
  /** The Owner is not asked to approve their own money. */
  enteredByTheOwner: boolean;
  /** The Money Event as it stood, for one being corrected. */
  before?: { terms: ApprovedTerms; approval: MoneyApproval };
}): MoneyApproval => {
  if (enteredByTheOwner || terms.amountBdt <= thresholdBdt) {
    return "not_needed";
  }
  return before?.approval === "approved" && sameTerms(before.terms, terms)
    ? "approved"
    : "awaiting";
};

/** Whether a correction left the Money Event's terms as they were. */
export const termsUnchanged = sameTerms;

/** Taka to the poisha, as money is kept. */
export const roundTaka = (amount: number): number =>
  Math.round(amount * 100) / 100;

/** A name as two entries of the same person are compared: one Unicode form, trimmed, whatever the capitals. */
const personKey = (name: string): string =>
  name.normalize("NFC").trim().toLowerCase();

/** Money already entered by hand, as a new entry is compared with it. */
export interface EnteredBefore {
  id: string;
  /** Who it went to or came from. */
  name: string | null;
  amountBdt: number;
  /** The farm day it was for ("YYYY-MM-DD"). */
  day: string;
}

/**
 * The entry this one looks like a second of: the same person — "Rahim" and "rahim " are one man — the same taka, and the
 * same farm day. Nothing where there is none; the first of them where there are several. A wage is not asked: one wage
 * a person a month is already the farm's rule.
 */
export const looksEnteredAlready = <Earlier extends EnteredBefore>(
  entry: { name: string; amountBdt: number; day: string },
  earlier: readonly Earlier[]
): Earlier | undefined =>
  earlier.find(
    (one) =>
      one.name !== null &&
      personKey(one.name) === personKey(entry.name) &&
      roundTaka(one.amountBdt) === roundTaka(entry.amountBdt) &&
      one.day === entry.day
  );
