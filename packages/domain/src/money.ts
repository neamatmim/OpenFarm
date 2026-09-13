/** How money changed hands. Shared with the client, which offers each; mirrored from the database's
 *  own list, which this package does not depend on. */
export const PAYMENT_METHODS = ["cash", "bkash", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type MoneyApproval = "not_needed" | "awaiting" | "approved";

/**
 * Where a Money Event stands with the Owner once its amount is known.
 *
 * Over the Approval Threshold, money the Owner did not enter waits for the Owner; at or under it, or
 * entered by the Owner, it waits for nobody. An approval is of an
 * amount: a Money Event the Owner approved keeps its approval while its amount stays what was
 * approved, and waits again when a Correction changes it.
 */
export const approvalOf = ({
  amountBdt,
  thresholdBdt,
  enteredByTheOwner,
  before,
}: {
  amountBdt: number;
  thresholdBdt: number;
  /** The Owner is not asked to approve their own money. */
  enteredByTheOwner: boolean;
  /** The Money Event as it stood, for one being corrected. */
  before?: { amountBdt: number; approval: MoneyApproval };
}): MoneyApproval => {
  if (enteredByTheOwner || amountBdt <= thresholdBdt) {
    return "not_needed";
  }
  return before?.approval === "approved" && before.amountBdt === amountBdt
    ? "approved"
    : "awaiting";
};

/** Taka to the poisha, as money is kept. */
export const roundTaka = (amount: number): number =>
  Math.round(amount * 100) / 100;
