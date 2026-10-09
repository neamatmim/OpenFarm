import { describe, expect, it } from "vitest";

import { paperText } from "./paper-text";
import type { VentureMonthFacts } from "./venture-month-paper";
import { ventureMonthPaper, ventureMonthRows } from "./venture-month-paper";

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

describe("one month of a Venture, as a spreadsheet takes it", () => {
  it("gives each charge a row, the month beside the run to its end, as numbers, and their total", () => {
    const rows = ventureMonthRows(FACTS);

    expect(rows).toContainEqual({
      part: { bn: "খরচ", en: "Charges" },
      line: { bn: "খাবার", en: "Feed" },
      way: null,
      thisMonth: 4000,
      toMonthEnd: 44_000,
      note: null,
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        line: { bn: "মোট", en: "Total" },
        thisMonth: 4000,
        toMonthEnd: 204_000,
      })
    );
  });

  it("counts the animals for the month alone, their weights in kilograms, and names those not weighed", () => {
    const rows = ventureMonthRows({
      ...FACTS,
      herd: {
        ...FACTS.herd,
        atEnd: 1,
        came: { bought: 1, boughtAcross: 0 },
        atEndKg: { averageKg: 342.5, animals: 1 },
        notWeighed: ["F-0002", "F-0003"],
      },
    });
    const of = (en: string) =>
      rows.find((one) => one.part.en === "Animals" && one.line.en === en);

    expect(of("At the month's start")).toMatchObject({
      thisMonth: 2,
      toMonthEnd: null,
    });
    expect(of("Bought")?.thisMonth).toBe(1);
    expect(of("Sold")?.thisMonth).toBe(2);
    expect(of("At the month's end")?.thisMonth).toBe(1);
    expect(of("Average weight at the month's end, kg")?.thisMonth).toBe(342.5);
    expect(of("Weighed by the month's end")?.thisMonth).toBe(1);
    expect(of("Gain a day, kg")?.thisMonth).toBe(1.5);
    expect(of("Not weighed in the month")).toMatchObject({
      thisMonth: 2,
      note: "F-0002 F-0003",
    });
  });

  it("walks the account from the month's start to its end, each movement with its way, and says the Bank Check", () => {
    const rows = ventureMonthRows({
      ...FACTS,
      account: {
        ...FACTS.account,
        bankCheck: {
          readMoney: 1_250_000,
          expectedMoney: 1_250_005,
          matched: false,
          stale: false,
        },
      },
    });
    const account = rows.filter((one) => one.part.en === "Venture account");

    expect(
      account.map((one) => [one.line.en, one.way, one.thisMonth, one.note])
    ).toEqual([
      ["At the month's start", null, 845_000, null],
      ["Sale money in", "in", 405_005, null],
      ["At the month's end", null, 1_250_005, null],
      ["Read off the bank statement", null, 1_250_000, "differs"],
      ["The farm expected", null, 1_250_005, null],
    ]);
    // Moved since it was read: the bank's figure alone, as the paper says it.
    const stale = ventureMonthRows({
      ...FACTS,
      account: {
        ...FACTS.account,
        bankCheck: {
          readMoney: 1_250_000,
          expectedMoney: 1_250_000,
          matched: false,
          stale: true,
        },
      },
    }).filter((one) => one.part.en === "Venture account");
    expect(stale.at(-1)).toMatchObject({
      line: { en: "Read off the bank statement" },
      thisMonth: 1_250_000,
      note: "stale",
    });
    const unchecked = ventureMonthRows(FACTS).filter(
      (one) => one.part.en === "Venture account"
    );
    expect(unchecked.at(-1)).toMatchObject({
      line: { en: "Read off the bank statement" },
      thisMonth: null,
      note: "not_checked",
    });
  });

  it("gives each animal sold her own rows on the day she went, and the Reimbursement the month's", () => {
    const rows = ventureMonthRows(FACTS);

    expect(
      rows
        .filter((one) => one.part.en === "Sold this month")
        .map((one) => [one.line.en, one.thisMonth, one.note])
    ).toEqual([
      ["F-0001 — Price", 202_505, "2047-03-18"],
      ["F-0001 — Cost to the venture", 104_500, "2047-03-18"],
      ["F-0001 — Price less cost", 98_005, "2047-03-18"],
    ]);
    expect(
      rows
        .filter((one) => one.part.en === "Reimbursement")
        .map((one) => [one.line.en, one.thisMonth, one.toMonthEnd])
    ).toEqual([
      ["Comes to", 4000, null],
      ["Paid", 0, null],
      ["Still owed", 4000, null],
    ]);
  });

  it("puts the plan and the Monthly Sums to the month's end, and leaves them out where it has none", () => {
    const rows = ventureMonthRows({
      ...FACTS,
      againstPlan: {
        plannedHeads: 2,
        boughtHeads: 2,
        plannedCattleMoney: 160_000,
        boughtMoney: 160_000,
        plannedRunningMoney: 200_000,
        runningSpentMoney: 44_000,
        plannedKg: 330,
        reachedKg: null,
      },
      sums: { dueMoney: 100_000, paidMoney: 90_000, missedMoney: 10_000 },
    });
    const of = (part: string, en: string) =>
      rows.find((one) => one.part.en === part && one.line.en === en);

    expect(of("Against the plan", "Running spend, planned")).toMatchObject({
      thisMonth: null,
      toMonthEnd: 200_000,
    });
    expect(of("Against the plan", "Running spend, actual")?.toMonthEnd).toBe(
      44_000
    );
    expect(
      of("Against the plan", "Average weight, kg, planned")?.toMonthEnd
    ).toBe(330);
    expect(
      of("Against the plan", "Average weight, kg, actual")?.toMonthEnd
    ).toBeNull();
    expect(of("Monthly sums", "Missed")).toMatchObject({
      thisMonth: null,
      toMonthEnd: 10_000,
    });
    expect(
      ventureMonthRows(FACTS).filter((one) =>
        ["Against the plan", "Monthly sums"].includes(one.part.en)
      )
    ).toEqual([]);
  });
});
