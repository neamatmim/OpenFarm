/** What an Alert is about. The list grows with the increments that raise them; the first
 *  increment raises the three that keep work from going quiet. Shared with the client, which
 *  has a message for each kind and should fail to compile when a new one arrives. */
export const ALERT_KINDS = [
  "instance_overdue",
  "instance_escalated",
  "instance_sent_back",
  "needs_review",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Why something is waiting for a person to look at it. Shared with the client, which has a
 *  message for each and should fail to compile when a new one arrives. */
export const REVIEW_REASONS = [
  "corrected_after_sign_off",
  "irreversible_effect",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];
