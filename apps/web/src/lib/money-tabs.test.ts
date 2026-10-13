import { describe, expect, it } from "vitest";

import { MONEY_TABS, readsThePeriod } from "./money-tabs";

describe("the money page's period", () => {
  it("stands over the tabs that read it: the register, the costs by Side and the accountant's export", () => {
    expect(MONEY_TABS.filter(readsThePeriod)).toEqual([
      "register",
      "costs",
      "accountant",
    ]);
  });

  it("is not over what is held now — the hands, the draws, what buyers owe — nor the bills to pay", () => {
    expect(MONEY_TABS.filter((tab) => !readsThePeriod(tab))).toEqual([
      "cash",
      "draws",
      "receivable",
      "supplierPayments",
    ]);
  });
});
