import { describe, expect, it } from "vitest";

import type { NeedsYou } from "./owner-counts";
import { decisionsWaiting, ownerCountsOf } from "./owner-counts";

/** Nothing waiting on the Owner, as the farm answers it. */
const NOTHING = {
  approvals: [],
  proposals: [],
  needsReview: [],
  moneyAwaiting: [],
  registrationRenewal: null,
  missing: [],
  storeCount: null,
  monthlyCosts: { costs: [], wages: [] },
  farmAccountsOut: [],
  bakiOverdue: [],
} as unknown as NeedsYou;

const counted = (needsYou: NeedsYou) =>
  Object.values(ownerCountsOf(needsYou)).reduce((sum, one) => sum + one, 0);

describe("what waits on the Owner", () => {
  it("counts nothing when nothing waits", () => {
    expect(counted(NOTHING)).toBe(0);
  });

  it("counts a missing animal, though it is no decision of hers", () => {
    const missing = { ...NOTHING, missing: [{}] } as unknown as NeedsYou;
    expect(decisionsWaiting(missing)).toBe(0);
    expect(counted(missing)).toBe(1);
  });

  it("counts a store count due, overdue Baki and an account not checked under their own kinds", () => {
    const waiting = {
      ...NOTHING,
      storeCount: {},
      bakiOverdue: [{}],
      farmAccountsOut: [{}],
    } as unknown as NeedsYou;
    expect(ownerCountsOf(waiting)).toMatchObject({ storeCount: 1, money: 2 });
  });

  it("counts an answer kept from before the newer kinds as nothing of them", () => {
    const old = {
      approvals: [],
      proposals: [],
      needsReview: [],
      moneyAwaiting: [],
      registrationRenewal: null,
    } as unknown as NeedsYou;
    expect(counted(old)).toBe(0);
  });
});
