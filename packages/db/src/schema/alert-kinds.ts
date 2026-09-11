/** What an Alert is about. Its own module so the column's enum and everything that reads it
 *  come from one list. Mirrored in @OpenFarm/domain, which the client reads; the db package
 *  deliberately depends on nothing. */
export const ALERT_KINDS = [
  "instance_overdue",
  "instance_escalated",
  "instance_sent_back",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
