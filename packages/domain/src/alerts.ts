/** What an Alert is about. The list grows with the increments that raise them; the first
 *  increment raises the three that keep work from going quiet. Shared with the client, which
 *  has a message for each kind and should fail to compile when a new one arrives. */
export const ALERT_KINDS = [
  "instance_overdue",
  "instance_escalated",
  "instance_sent_back",
  "needs_review",
  "sop_published",
  "sop_proposed",
  "withdrawal_ending",
  "notifiable_diagnosis",
  "entry_rejected",
  "withdrawal_changed",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Why something is waiting for a person to look at it. Shared with the client, which has a
 *  message for each and should fail to compile when a new one arrives. */
export const REVIEW_REASONS = [
  "corrected_after_sign_off",
  "irreversible_effect",
  /** An entry that no longer fits the world it arrived into. */
  "late_entry",
  /** A phone's sequence skipped numbers: entries that were never read. */
  "sync_gap",
  /** A device's clock is far enough out that its times cannot be taken at face value. */
  "clock_skew",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];
