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
  "low_stock",
  "money_awaiting_approval",
  "registration_renewal_due",
  "investor_statement_due",
  "day_not_turning",
  "backup_overdue",
  "lot_expiring",
  "lot_expired",
  "medicine_low_stock",
  "expired_dose_given",
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
  /** A weighing that moved further than an animal can, kept and put in front of the Manager to doubt. */
  "implausible_weight",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];
