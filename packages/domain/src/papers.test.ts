import { describe, expect, it } from "vitest";

import type { SettlementStatement } from "./papers";
import { settlementStatement } from "./papers";

// The হিসাব নিকাশ's line on an Investor's capital (ADR 0012): under their payout, a share over its days, a loss said as
// a loss — never a minus sign after the figure, and never a rate a year.

const sheet = (
  onCapital: SettlementStatement["onCapital"]
): SettlementStatement => ({
  farm: {
    name: "সবুজ খামার",
    address: "সাভার",
    phone: "01711-000000",
    registrationNumber: "DLS/SAV/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  producedBy: "মালিক",
  producedAt: "১ এপ্রিল",
  investorName: "রফিক",
  ventureName: "কোরবানি ভেঞ্চার",
  approvedOn: "১ এপ্রিল",
  proceeds: "৯,০০,০০০",
  charges: [],
  charged: "১০,০০,০০০",
  result: "১,০০,০০০",
  inProfit: false,
  investorsPercent: "৬০",
  units: "২০",
  perUnit: "৩,০০০",
  perUnitRose: false,
  perUnitIn: "৫০,০০০",
  perUnitBack: "৪৭,০০০",
  rounding: "০",
  farmShare: "৪০,০০০",
  farmShareRose: false,
  advance: null,
  advanceRepaid: false,
  his: {
    units: "২০",
    capital: "১০,০০,০০০",
    share: "৬০,০০০",
    shareRose: false,
    payout: "৯,৪০,০০০",
    reference: "PAY-1",
    paidOn: "২ এপ্রিল",
  },
  onCapital,
  herd: [],
  adjustments: [],
});

const capitalLine = (text: string) =>
  text.split("\n").find((line) => line.includes("মূলধনে"));

describe("the হিসাব নিকাশ's line on their capital", () => {
  it("says a loss as a loss, unsigned, under the payout", () => {
    const text = settlementStatement(
      sheet({ per100: "৬", days: "৮৯", rose: false })
    );
    const line = capitalLine(text);
    expect(line).toContain("প্রতি ১০০ টাকা মূলধনে ৬ টাকা ক্ষতি, ৮৯ দিনে");
    expect(line).toContain(
      "৬ lost on every ৳100 of your capital, over ৮৯ days"
    );
    expect(line).not.toMatch(/-|−/u);
    const lines = text.split("\n");
    expect(lines.indexOf(line ?? "")).toBeGreaterThan(
      lines.findIndex((one) => one.includes("মোট প্রাপ্য"))
    );
  });

  it("prints nothing of it while the Owner has not shown it", () => {
    expect(capitalLine(settlementStatement(sheet(null)))).toBeUndefined();
  });
});
