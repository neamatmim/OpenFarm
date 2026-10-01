import { describe, expect, it } from "vitest";

import type { SaleReceipt, SettlementStatement } from "./papers";
import { saleReceipt, settlementStatement } from "./papers";

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

describe("the হিসাব নিকাশ of a man who paid by the month and missed some", () => {
  it("prints the Units he held by what he paid beside what he signed for, and what never came", () => {
    const missed = sheet(null);
    const text = settlementStatement({
      ...missed,
      his: {
        ...missed.his,
        units: "৯.৬",
        signedUnits: "১০",
        sumsUnpaid: "২০,০০০",
      },
    });

    expect(text).toContain(
      "দেওয়া মূলধন অনুযায়ী ইউনিট / Units held, by capital paid: ৯.৬ (সই করা ১০)"
    );
    expect(text).toContain("বাকি পড়া মাসের টাকা / Monthly Sums not paid: ২০,০০০ টাকা");
  });

  it("prints his Units as ever where he paid everything", () => {
    const text = settlementStatement(sheet(null));

    expect(text).toContain("ইউনিট / Units held: ২০");
    expect(text).not.toContain("সই করা");
    expect(text).not.toContain("বাকি পড়া মাসের টাকা");
  });
});

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

const receipt = (baki: SaleReceipt["baki"]): SaleReceipt => ({
  farm: {
    name: "সবুজ খামার",
    address: "সাভার",
    phone: "01711-000000",
    registrationNumber: "DLS/SAV/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  buyerName: "করিম ব্যাপারী",
  buyerAddress: null,
  buyerPhone: null,
  day: "১৬ জুন",
  animals: [{ tagNumber: "F-0012", weight: "৩৩০", price: "১,২০,০০০" }],
  total: "১,২০,০০০",
  baki,
  producedBy: "ম্যানেজার",
  producedAt: "১৬ জুন",
});

// A trader who took a bull and still owes on it signs for what he owes: the paper is what the farm can hold him to.
describe("the receipt of a buyer who still owes", () => {
  it("says what he paid, what he owes and the day he promised, above his signature", () => {
    const text = saleReceipt(
      receipt({ paid: "১,০০,০০০", owed: "২০,০০০", toBePaidBy: "২৩ জুন" })
    );
    expect(text).toContain("পরিশোধ / Paid: ১,০০,০০০ টাকা");
    expect(text).toContain("বাকি / Still owed: ২০,০০০ টাকা");
    expect(text).toContain("পরিশোধের তারিখ / To be paid by: ২৩ জুন");
    expect(text.indexOf("Still owed")).toBeLessThan(text.indexOf("Buyer: _"));
  });

  it("says nothing of it for a buyer who paid in full", () => {
    const text = saleReceipt(receipt(null));
    expect(text).not.toContain("Still owed");
    expect(text).not.toContain("To be paid by");
  });
});
