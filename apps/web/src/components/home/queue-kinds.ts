/**
 * The kinds of thing the Manager's and the Owner's home pages are tabbed by, kept apart from the pages: the routes read
 * them to check their address before the page is drawn, and from the page module they brought the whole home into the
 * first download of every screen.
 */

/** The kinds of thing waiting for the Manager, loudest first: the order the tabs read in, and the first one that has
 *  anything is the one the page opens on. */
export const QUEUE_KINDS = [
  "missing",
  "overdue",
  "signOff",
  "review",
  "withdrawal",
  "meatWithdrawal",
  "lowStock",
  "monthlyCosts",
  "receivableOverdue",
  "repeatBreeders",
  "illAgain",
  "heatWatch",
  "givingLess",
] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

/** The kinds of thing only the Owner can settle, in the order they are read. */
export const DECISION_KINDS = [
  "missing",
  "storeCount",
  "ventures",
  "registration",
  "approvals",
  "proposals",
  "money",
  "review",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** What the farm's day has for the Owner to know about, loudest first: the order its tabs read in. */
export const FARM_TODAY_KINDS = [
  "overdue",
  "lowStock",
  "endingWithdrawal",
] as const;
export type FarmTodayKind = (typeof FARM_TODAY_KINDS)[number];
