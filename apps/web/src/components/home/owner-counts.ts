import type { client } from "@/utils/orpc";

/** The Owner's exception list as the farm answers it. */
export type NeedsYou = Awaited<
  ReturnType<typeof client.home.owner>
>["needsYou"];

/** Every kind of thing that can wait on the Owner, apart from the Ventures, which come from their own list. */
export type OwnerKind =
  | "missing"
  | "storeCount"
  | "registration"
  | "approvals"
  | "proposals"
  | "money"
  | "review";

/** How many entries of money wait for the Owner's word — all of them, as the farm counts them, where the list shows the
 *  oldest few; in an answer a phone kept from before it did, the rows it was sent. */
export const moneyAwaitingCount = (needsYou: NeedsYou): number =>
  needsYou.moneyAwaitingAll?.count ?? needsYou.moneyAwaiting.length;

/** The taka the money awaiting approval comes to, whichever way it goes — the farm's total, or the rows sent in an
 *  answer kept from before. */
export const moneyAwaitingTotal = (needsYou: NeedsYou): number =>
  needsYou.moneyAwaitingAll?.totalMoney ??
  needsYou.moneyAwaiting.reduce((sum, row) => sum + row.amountMoney, 0);

/** How many rows of the month's rent, electricity and wages are not entered yet — none in an answer a phone kept from before
 *  there were Monthly Costs. */
export const monthlyCostsMissing = (needsYou: NeedsYou): number =>
  (needsYou.monthlyCosts?.costs.length ?? 0) +
  (needsYou.monthlyCosts?.wages.length ?? 0);

/**
 * How many of each kind wait on the Owner — one count, read by the tabs that list them and by whatever says the farm is
 * all fine, so nothing can wait under a green "all fine". None for a kind an answer the phone kept from before does not
 * carry.
 */
export const ownerCountsOf = (
  needsYou: NeedsYou
): Record<OwnerKind, number> => ({
  // Missing from an answer a phone kept from before a Missing was written down.
  missing: needsYou.missing?.length ?? 0,
  storeCount: needsYou.storeCount ? 1 : 0,
  registration: needsYou.registrationRenewal ? 1 : 0,
  approvals: needsYou.approvals.length,
  proposals: needsYou.proposals.length,
  money:
    moneyAwaitingCount(needsYou) +
    monthlyCostsMissing(needsYou) +
    // Missing from an answer a phone kept from before Farm Accounts were checked.
    (needsYou.farmAccountsOut?.length ?? 0) +
    // Missing from an answer a phone kept from before Receivable was written down.
    (needsYou.receivableOverdue?.length ?? 0),
  review: needsYou.needsReview.length,
});

/** Everything waiting on the Owner, every kind counted: what decides whether the farm is all fine. */
export const anythingWaiting = (needsYou: NeedsYou): number =>
  Object.values(ownerCountsOf(needsYou)).reduce((sum, count) => sum + count, 0);

/** What waits on the Owner's own word: work to sign off, proposals, money, entries to decide, the Registration — the
 *  figure on the badge. Not the month's costs not entered yet, a missing animal or a store to count: the Manager sees
 *  to those, and the Owner is shown them all the same. */
export const decisionsWaiting = (needsYou: NeedsYou): number =>
  needsYou.approvals.length +
  needsYou.proposals.length +
  needsYou.needsReview.length +
  moneyAwaitingCount(needsYou) +
  (needsYou.registrationRenewal ? 1 : 0);
