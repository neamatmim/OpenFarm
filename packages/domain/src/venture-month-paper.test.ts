import { describe, expect, it } from "vitest";

import { paperText } from "./paper-text";
import type { VentureMonthFacts } from "./venture-month-paper";
import { ventureMonthPaper } from "./venture-month-paper";

const FACTS: VentureMonthFacts = {
  farm: {
    name: "সবুজ ছায়া ডেইরি",
    address: "সাভার, ঢাকা",
    phone: "+8801711000098",
    registrationNumber: "DLS/SAV/2047/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  ventureName: "কোরবানি ২০৪৭ ভেঞ্চার",
  month: "2047-03",
  soFarTo: "2047-03-25",
  herd: {
    atStart: 2,
    atEnd: 0,
    came: { bought: 0, boughtAcross: 0 },
    went: { sold: 2, soldAcross: 0, died: 0, lost: 0 },
    atEndKg: null,
    gainKgPerDay: 1.5,
    weighed: 2,
    notWeighed: [],
  },
  charges: [
    {
      label: { bn: "পশু কেনা", en: "Cattle bought" },
      monthMoney: 0,
      toEndMoney: 160_000,
    },
    { label: { bn: "খাবার", en: "Feed" }, monthMoney: 4000, toEndMoney: 44_000 },
  ],
  account: {
    openingMoney: 845_000,
    moved: [
      {
        label: { bn: "ক্রেতা নিয়ে গেছে", en: "Sale money in" },
        direction: "in",
        amountMoney: 405_005,
      },
    ],
    closingMoney: 1_250_005,
    bankCheck: null,
  },
  reimbursement: { comesToMoney: 4000, paidMoney: 0, stillOwedMoney: 4000 },
  sold: [
    {
      tagNumber: "F-0001",
      soldOn: "2047-03-18",
      priceMoney: 202_505,
      costMoney: 104_500,
      lessCostMoney: 98_005,
    },
  ],
  againstPlan: null,
  sums: null,
  producedAt: { bn: "২৫ মার্চ, ২০৪৭", en: "25 March 2047" },
  producedBy: "মোঃ আব্দুল করিম",
};

describe("one month of a Venture, on paper", () => {
  it("is headed with the Venture and the month, so far to the day, and says every part in Bangla numerals", () => {
    const text = paperText(ventureMonthPaper(FACTS), "bn");

    expect(text).toContain("মাসিক প্রতিবেদন — কোরবানি ২০৪৭ ভেঞ্চার — মার্চ ২০৪৭");
    expect(text).toContain("২৫ মার্চ, ২০৪৭ পর্যন্ত");
    for (const part of [
      "পশু",
      "খরচ",
      "ভেঞ্চার হিসাব",
      "খামারকে ফেরত",
      "এই মাসে বিক্রি",
    ]) {
      expect(text).toContain(part);
    }
    expect(text).toContain("১২,৫০,০০৫");
    expect(text).toContain("F-0001");
    expect(text).not.toContain("1,250,005");
  });

  it("says the same in English, the month beside the run to its end", () => {
    const text = paperText(ventureMonthPaper(FACTS), "en");

    expect(text).toContain("Monthly report — কোরবানি ২০৪৭ ভেঞ্চার — March 2047");
    expect(text).toContain("Feed · 4,000 taka · 44,000 taka");
    expect(text).toContain("+ Sale money in · 405,005 taka");
    expect(text).toContain("98,005 taka");
    expect(text).toContain(
      "No bank statement has been checked for this month."
    );
  });

  it("prints no profit, share, Margin, overheads, return on cost or projection, and says why", () => {
    const text = paperText(ventureMonthPaper(FACTS), "en");

    expect(text).not.toMatch(/projected|profit of|margin of/iu);
    expect(text).toContain("cannot tell profit");
    expect(text).toContain("return on cost");
  });

  it("says a part with nothing in it, rather than a table of noughts", () => {
    const text = paperText(
      ventureMonthPaper({
        ...FACTS,
        herd: {
          ...FACTS.herd,
          atStart: 0,
          went: { sold: 0, soldAcross: 0, died: 0, lost: 0 },
        },
        sold: [],
        account: { ...FACTS.account, moved: [] },
      }),
      "en"
    );

    expect(text).toContain("The venture had no animals this month.");
    expect(text).toContain("No animal was sold this month.");
    expect(text).toContain("No money moved this month.");
  });

  it("adds the plan and the Monthly Sums where it has them", () => {
    const text = paperText(
      ventureMonthPaper({
        ...FACTS,
        againstPlan: {
          plannedHeads: 2,
          boughtHeads: 2,
          plannedCattleMoney: 160_000,
          boughtMoney: 160_000,
          plannedRunningMoney: 200_000,
          runningSpentMoney: 44_000,
          plannedKg: 330,
          reachedKg: 340,
        },
        sums: { dueMoney: 100_000, paidMoney: 90_000, missedMoney: 10_000 },
      }),
      "en"
    );

    expect(text).toContain("Against the plan");
    expect(text).toContain("Monthly sums");
    expect(text).toContain("Running spend · 200,000 taka · 44,000 taka");
    expect(text).toContain("Average weight · 330 kg · 340 kg");
    expect(text).toContain("Missed · 10,000 taka");
    const bn = paperText(
      ventureMonthPaper({
        ...FACTS,
        againstPlan: {
          plannedHeads: 2,
          boughtHeads: 2,
          plannedCattleMoney: 160_000,
          boughtMoney: 160_000,
          plannedRunningMoney: 200_000,
          runningSpentMoney: 44_000,
          plannedKg: 330,
          reachedKg: 340,
        },
        sums: { dueMoney: 100_000, paidMoney: 90_000, missedMoney: 10_000 },
      }),
      "bn"
    );
    expect(bn).toContain("পরিকল্পনার সাথে");
    expect(bn).toContain("মাসিক কিস্তি");
    expect(bn).toContain("বাকি পড়েছে · ১০,০০০ টাকা");
  });
});
