import { describe, expect, it } from "vitest";

import type { AccountantSummaryFacts } from "./accountant-summary-paper";
import { accountantSummaryPaper } from "./accountant-summary-paper";
import { paperText } from "./paper-text";

const FACTS: AccountantSummaryFacts = {
  farm: {
    name: "সবুজ ছায়া ডেইরি",
    address: "সাভার, ঢাকা",
    phone: "+8801711000098",
    registrationNumber: "DLS/SAV/2026/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  from: "2026-10-01",
  to: "2026-10-09",
  summary: {
    incomeMoney: 692_379.05,
    expenseMoney: 1_208_450,
    netMoney: -516_070.95,
    byCategory: [
      { nameBn: "খাদ্য কেনা", nameEn: "Feed", inMoney: 0, outMoney: 220_580 },
      { nameBn: "দুধ বিক্রি", nameEn: null, inMoney: 113_767, outMoney: 0 },
    ],
    byCounterparty: [
      { name: null, inMoney: 221_612.05, outMoney: 11_420 },
      { name: "আলমগীর হোসেন", inMoney: 0, outMoney: 976_450 },
    ],
    bySide: [
      { side: "dairy", inMoney: 113_767, outMoney: 0 },
      { side: null, inMoney: 0, outMoney: 11_420 },
    ],
    awaiting: { count: 15, inMoney: 347_000, outMoney: 1_165_350 },
  },
  receivableAtTheEnd: [
    { name: "মো. কামাল", owingMoney: 30_000 },
    { name: "মা মিষ্টান্ন", owingMoney: 5250 },
  ],
  producedAt: { bn: "৯ অক্টোবর ২০২৬", en: "9 October 2026" },
  producedBy: "মোঃ আব্দুল করিম",
};

describe("the accountant's summary, on paper", () => {
  it("is headed with the period and sets income, expense and net apart, in English throughout", () => {
    const text = paperText(accountantSummaryPaper(FACTS), "en");

    expect(text).toContain("Income and expense");
    expect(text).toContain("1 October 2026");
    expect(text).toContain("9 October 2026");
    expect(text).toContain("Income · 692,379.05 taka");
    expect(text).toContain("Expense · 1,208,450 taka");
    // The minus leads the figure, never stuck between a sign and its digits.
    expect(text).toContain("Net · -516,070.95 taka");
    expect(text).not.toMatch(/[ঀ-৿]{2,} \/ [A-Z]/u);
  });

  it("reads wholly in Bangla, its figures in Bangla numerals", () => {
    const text = paperText(accountantSummaryPaper(FACTS), "bn");

    expect(text).toContain("আয় ও ব্যয়");
    expect(text).toContain("৬,৯২,৩৭৯.০৫ টাকা");
    expect(text).not.toContain("Income");
    expect(text).not.toContain("692,379");
  });

  it("tables the money by category, by counterparty and by side, in and out, a dash for none", () => {
    const text = paperText(accountantSummaryPaper(FACTS), "en");

    expect(text).toContain("By category");
    expect(text).toContain("Feed · — · 220,580 taka");
    // A Category given no English is read in its Bangla.
    expect(text).toContain("দুধ বিক্রি · 113,767 taka · —");
    expect(text).toContain("Not named · 221,612.05 taka · 11,420 taka");
    expect(text).toContain("Dairy · 113,767 taka · —");
    expect(text).toContain("Whole farm · — · 11,420 taka");
  });

  it("says the money awaiting approval, counted in, and who owed the farm at the period's end with their total", () => {
    const text = paperText(accountantSummaryPaper(FACTS), "en");

    expect(text).toContain(
      "15 entries are still awaiting approval: 347,000 taka in, 1,165,350 taka out. They are counted in every figure here."
    );
    expect(text).toContain("Owed to the farm at the period's end");
    expect(text).toContain("মো. কামাল · 30,000 taka");
    expect(text).toContain("Total · 35,250 taka");
  });

  it("leaves out who owed the farm, and the money awaiting approval, when there is none", () => {
    const text = paperText(
      accountantSummaryPaper({
        ...FACTS,
        summary: {
          ...FACTS.summary,
          awaiting: { count: 0, inMoney: 0, outMoney: 0 },
        },
        receivableAtTheEnd: [],
      }),
      "en"
    );

    expect(text).not.toContain("awaiting approval");
    expect(text).not.toContain("Owed to the farm");
  });
});
