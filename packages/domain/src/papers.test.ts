import { describe, expect, it } from "vitest";

import type {
  ProgressStatementFacts,
  SettlementStatementFacts,
} from "./investor-statements";
import {
  progressStatementPaper,
  settlementStatementPaper,
} from "./investor-statements";
import { paperText } from "./paper-text";
import type { SaleReceipt } from "./papers";
import { saleReceipt } from "./papers";

const FARM = {
  name: "সবুজ খামার",
  address: "সাভার",
  phone: "01711-000000",
  registrationNumber: "DLS/SAV/1",
  registrationOffice: null,
  registrationIssuedOn: null,
  registrationExpiresOn: null,
};

/** A Bangla numeral anywhere: what a paper read in English must not carry in its figures. */
const BANGLA_DIGIT = /[০-৯]/u;
/** A Latin figure just before a Bangla unit: the one thing neither reader reads cleanly. */
const LATIN_BESIDE_BANGLA = /[0-9][0-9,.]* (?:টাকা|দিন|কেজি)/u;

// The হিসাব নিকাশ's line on an Investor's capital (ADR 0012): under their payout, a share over its days, a loss said as
// a loss — never a minus sign after the figure, and never a rate a year.

const sheet = (
  onCapital: SettlementStatementFacts["onCapital"]
): SettlementStatementFacts => ({
  farm: FARM,
  producedBy: "মালিক",
  producedAt: { bn: "১ এপ্রিল", en: "1 April" },
  investorName: "রফিক",
  ventureName: "কোরবানি ভেঞ্চার",
  approvedOn: "2053-04-01",
  proceedsMoney: 900_000,
  charges: [],
  chargedMoney: 1_000_000,
  profitMoney: -100_000,
  investorsPercent: 60,
  units: 20,
  perUnitMoney: -3000,
  perUnitInMoney: 50_000,
  roundingMoney: 0,
  farmMoney: -40_000,
  advance: null,
  his: {
    units: 20,
    signedUnits: null,
    sumsUnpaidMoney: null,
    capitalMoney: 1_000_000,
    shareMoney: -60_000,
    payoutMoney: 940_000,
    reference: "PAY-1",
    paidOn: "2053-04-02",
  },
  onCapital,
  herd: [],
  adjustments: [],
});

const bn = (facts: SettlementStatementFacts) =>
  paperText(settlementStatementPaper(facts), "bn");
const en = (facts: SettlementStatementFacts) =>
  paperText(settlementStatementPaper(facts), "en");

const capitalLine = (text: string) =>
  text.split("\n").find((line) => line.includes("মূলধনে"));

describe("the হিসাব নিকাশ of a man who paid by the month and missed some", () => {
  it("prints the Units he held by what he paid beside what he signed for, and what never came", () => {
    const missed = sheet(null);
    const facts = {
      ...missed,
      his: {
        ...missed.his,
        units: 9.6,
        signedUnits: 10,
        sumsUnpaidMoney: 20_000,
      },
    };

    expect(bn(facts)).toContain("দেওয়া মূলধন অনুযায়ী ইউনিট: ৯.৬ (সই করা ১০)");
    expect(bn(facts)).toContain("বাকি পড়া মাসের টাকা: ২০,০০০ টাকা");
    expect(en(facts)).toContain(
      "Units held, by capital paid: 9.6 (10 signed for)"
    );
    expect(en(facts)).toContain("Monthly Sums not paid: 20,000 taka");
  });

  it("prints his Units as ever where he paid everything", () => {
    const text = bn(sheet(null));

    expect(text).toContain("ইউনিট: ২০");
    expect(text).not.toContain("সই করা");
    expect(text).not.toContain("বাকি পড়া মাসের টাকা");
  });
});

describe("the হিসাব নিকাশ's line on their capital", () => {
  it("says a loss as a loss, unsigned, under the payout", () => {
    const facts = sheet({ per100: -6, days: 89 });
    const line = capitalLine(bn(facts));
    expect(line).toContain("প্রতি ১০০ টাকা মূলধনে ৬ টাকা ক্ষতি, ৮৯ দিনে");
    expect(line).not.toMatch(/-|−/u);
    const lines = bn(facts).split("\n");
    expect(lines.indexOf(line ?? "")).toBeGreaterThan(
      lines.findIndex((one) => one.includes("মোট প্রাপ্য"))
    );
    const english = en(facts).split("\n");
    const said = english.find((one) => one.startsWith("On your capital"));
    expect(said).toContain(
      "6 lost on every ৳100 of your capital, over 89 days"
    );
    expect(said).not.toMatch(/-|−/u);
    expect(english.indexOf(said ?? "")).toBeGreaterThan(
      english.findIndex((one) => one.startsWith("Your payout"))
    );
  });

  it("prints nothing of it while the Owner has not shown it", () => {
    expect(capitalLine(bn(sheet(null)))).toBeUndefined();
    expect(en(sheet(null))).not.toContain("On your capital");
  });
});

describe("the হিসাব নিকাশ read in English", () => {
  const settled: SettlementStatementFacts = {
    ...sheet(null),
    charges: [
      { label: { bn: "পশু কেনা", en: "Cattle bought" }, amountMoney: 800_000 },
      { label: { bn: "খাবার", en: "Feed" }, amountMoney: 200_000 },
    ],
    herd: [
      {
        label: { bn: "কেনা হয়েছে", en: "Bought" },
        value: { bn: "২০ · গড়ে ৪০,০০০ টাকা", en: "20 · 40,000 taka on average" },
      },
    ],
    adjustments: [
      {
        reason: "late bill",
        raisedOn: "2053-04-20",
        outcome: { bn: "লেখা আছে", en: "noted" },
        differenceMoney: -1200,
        paidMoney: 0,
      },
    ],
  };

  it("says every figure in English numerals and English words, and a loss as a loss", () => {
    const text = en(settled);
    expect(text).toContain("Settlement statement");
    expect(text).toContain("Proceeds: 900,000 taka");
    expect(text).toContain("Cattle bought · 800,000 taka");
    expect(text).toContain("Total charged · 1,000,000 taka");
    expect(text).toContain("Loss: 100,000 taka");
    expect(text).toContain("Loss per Unit: 3,000 taka");
    expect(text).toContain("Per Unit: 50,000 taka in, 47,000 taka back");
    expect(text).toContain("The Farm's share of the loss: 40,000 taka");
    expect(text).toContain("Your share of the loss, off capital: 60,000 taka");
    expect(text).toContain("Sent: 2 April 2053 · PAY-1");
    expect(text).toContain("Approved on: 1 April 2053");
    expect(text).toContain("down 1,200 taka");
    expect(text).toContain("Bought: 20 · 40,000 taka on average");
    expect(text).toContain(
      "No return is guaranteed. A loss comes off capital."
    );
    expect(text).toContain(
      "Anything arriving later comes as a Settlement Adjustment, not by this sheet being rewritten."
    );
    expect(text).toContain("1 April · মালিক");
    // The farm's own name and the Owner's are as they were written; every figure is in English numerals.
    expect(
      text.replaceAll(/সবুজ খামার|সাভার|মালিক|রফিক|কোরবানি ভেঞ্চার/gu, "")
    ).not.toMatch(BANGLA_DIGIT);
    // A minus before a figure, not the hyphen inside a phone number or a reference.
    expect(text).not.toMatch(/(?<!\w)[-−]\d/u);
  });

  it("says every figure of the Bangla in Bangla numerals", () => {
    const text = bn(settled);
    expect(text).toContain("হিসাব নিকাশ");
    expect(text).toContain("মোট বিক্রি: ৯,০০,০০০ টাকা");
    expect(text).toContain("পশু কেনা · ৮,০০,০০০ টাকা");
    expect(text).toContain("ক্ষতি: ১,০০,০০০ টাকা");
    expect(text).toContain("প্রতি ইউনিট: ৫০,০০০ টাকা দিয়ে ৪৭,০০০ টাকা");
    expect(text).toContain("কমেছে ১,২০০ টাকা");
    expect(text).not.toMatch(LATIN_BESIDE_BANGLA);
    expect(text).not.toContain("লাভ:");
  });
});

const progress = (
  animals: ProgressStatementFacts["animals"]
): ProgressStatementFacts => ({
  farm: FARM,
  investorName: "রফিক",
  ventureName: "কোরবানি ভেঞ্চার",
  units: 6,
  sharePercent: 60,
  farmUnits: { units: 3, ventureUnits: 10 },
  monthlySums: {
    sums: 4,
    sumsPaid: 2,
    missedMoney: 5000,
    next: { dueOn: "2076-04-10", amountMoney: 2500 },
  },
  standing: 3,
  sold: 1,
  died: 1,
  lost: 0,
  weighed: 2,
  averageIntakeKg: 210,
  averageLatestKg: 224.5,
  herdGainKgPerDay: 0.74,
  daysToWindow: 41,
  animals,
  spend: [
    { label: { bn: "পশু কেনা", en: "Cattle bought" }, amountMoney: 360_000 },
  ],
  spendTotalMoney: 360_000,
  budgets: {
    cattle: { plannedMoney: 400_000, leftMoney: 154_000 },
    running: { plannedMoney: 100_000, spentMoney: 0 },
  },
  producedBy: "মালিক",
  producedAt: { bn: "১ এপ্রিল", en: "1 April" },
});

const AN_ANIMAL: ProgressStatementFacts["animals"][number] = {
  tagNumber: "F-0012",
  intakeKg: 210,
  latestKg: 232.5,
  gain: { bn: "০.৮ কেজি (৩০ দিনে)", en: "0.8 kg (over 30 days)" },
};

describe("the অগ্রগতি read in either language", () => {
  it("says the animals, the spend and the budgets in Bangla, with Bangla numerals", () => {
    const text = paperText(progressStatementPaper(progress([AN_ANIMAL])), "bn");
    expect(text).toContain("অগ্রগতি");
    expect(text).toContain("ইউনিট: ৬ (৬০%)");
    expect(text).toContain("খামারের নিজের ইউনিট: ৩ / ১০");
    expect(text).toContain(
      "মাসের টাকা: ৪ মাসের ২টি দেওয়া · বাকি পড়েছে ৫,০০০ টাকা · পরেরটি ১০ এপ্রিল, ২০৭৬, ২,৫০০ টাকা"
    );
    expect(text).toContain("গড় ওজন (এখন): ২২৪.৫ কেজি");
    expect(text).toContain("লক্ষ্য সময় বাকি: ৪১ দিন");
    expect(text).toContain("ট্যাগ · শুরুর ওজন · এখনকার ওজন · দৈনিক বৃদ্ধি");
    expect(text).toContain(
      "F-0012 · ২১০ কেজি · ২৩২.৫ কেজি · ০.৮ কেজি (৩০ দিনে)"
    );
    expect(text).toContain("মোট · ৩,৬০,০০০ টাকা");
    expect(text).toContain("পশু কেনার বাজেটের বাকি: ১,৫৪,০০০ টাকা");
    expect(text).toContain("কোনো মুনাফার নিশ্চয়তা নেই");
    expect(text).not.toMatch(LATIN_BESIDE_BANGLA);
  });

  it("says them in English, with English numerals and English units", () => {
    const text = paperText(progressStatementPaper(progress([AN_ANIMAL])), "en");
    expect(text).toContain("Progress statement");
    expect(text).toContain("Units held: 6 (60%)");
    expect(text).toContain(
      "Monthly Sums: 2 of 4 paid · 5,000 taka missed · next due 10 April 2076, 2,500 taka"
    );
    expect(text).toContain("Average weight now: 224.5 kg");
    expect(text).toContain(
      "Daily gain (every animal so far, sold and dead included): 0.74 kg"
    );
    expect(text).toContain("Days to the window: 41 days");
    expect(text).toContain("Tag · At intake · Now · Daily gain");
    expect(text).toContain(
      "F-0012 · 210 kg · 232.5 kg · 0.8 kg (over 30 days)"
    );
    expect(text).toContain("Total · 360,000 taka");
    expect(text).toContain("Cattle budget: 400,000 taka");
    expect(text).toContain("Running budget spent: 0 taka");
    expect(text).toContain(
      "No return is guaranteed. A loss comes off capital."
    );
    expect(
      text.replaceAll(/সবুজ খামার|সাভার|মালিক|রফিক|কোরবানি ভেঞ্চার/gu, "")
    ).not.toMatch(BANGLA_DIGIT);
  });

  it("says in words that nothing has been bought yet, with no column heading over nothing", () => {
    const document = progressStatementPaper(progress([]));
    expect(
      document.sections.some(
        (one) => one.kind === "table" && one.rows.length === 0
      )
    ).toBe(false);
    expect(paperText(document, "bn")).toContain("এখনো কোনো পশু নেই");
    expect(paperText(document, "bn")).not.toContain("ট্যাগ · শুরুর ওজন");
    expect(paperText(document, "en")).toContain("None yet");
  });
});

const receipt = (receivable: SaleReceipt["receivable"]): SaleReceipt => ({
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
  receivable,
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
