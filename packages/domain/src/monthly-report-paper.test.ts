import { describe, expect, it } from "vitest";

import type { MonthlyReportFacts } from "./monthly-report-paper";
import { monthlyReportPaper, monthlyReportRows } from "./monthly-report-paper";
import { paperText } from "./paper-text";

const FIGURES = {
  money: {
    inMoney: 89_300,
    outMoney: 56_000,
    netMoney: 33_300,
    awaitingCount: 2,
  },
  dairy: {
    milkSoldMoney: 9300,
    litersSold: 150,
    fetchedPerLiterMoney: 62,
    chargedMoney: 4100,
    litersToBulk: 140,
    litersPerCowMilked: 8.5,
    costPerLiterMoney: 29.29,
    unpricedKg: 120,
    uncostedDoses: 3,
  },
  fattening: {
    chargedMoney: 2800,
    sold: 1,
    marginMoney: 24_500,
    unpricedKg: 0,
    uncostedDoses: 0,
  },
  overheads: { amount: 6000, perHeadPerDayMoney: 12.5 },
  results: {
    dairy: {
      broughtInMoney: 9300,
      beforeOverheadsMoney: 5200,
      overheadsMoney: 3000,
      afterOverheadsMoney: 2200,
      marginBeforePercent: 55.9,
      marginAfterPercent: 23.7,
    },
    fattening: {
      broughtInMoney: 80_000,
      beforeOverheadsMoney: 24_500,
      overheadsMoney: 2000,
      afterOverheadsMoney: 22_500,
      marginBeforePercent: 30.6,
      marginAfterPercent: 28.1,
    },
    restOfOverheadsMoney: 1000,
    farm: {
      broughtInMoney: 89_300,
      beforeOverheadsMoney: 29_700,
      overheadsMoney: 6000,
      afterOverheadsMoney: 23_700,
      marginBeforePercent: 33.3,
      marginAfterPercent: 26.5,
    },
  },
  atEnd: {
    receivables: {
      owingMoney: 36_000,
      overdueMoney: 6000,
      ages: [
        { age: "0-7" as const, owingMoney: 0 },
        { age: "8-15" as const, owingMoney: 30_000 },
        { age: "16-30" as const, owingMoney: 6000 },
        { age: "31-60" as const, owingMoney: 0 },
        { age: "over-60" as const, owingMoney: 0 },
      ],
    },
    store: {
      feedMoney: 40_000,
      medicineMoney: 5000,
      totalMoney: 45_000,
      unpriced: 1,
    },
    cash: {
      inHandsMoney: 221_900,
      venturesInHandsMoney: 90_000,
      farmsInHandsMoney: 131_900,
      inAccountsMoney: 115_000,
      accountsNotRead: 1,
      farmsOwnMoney: 246_900,
    },
  },
  cashFlow: {
    openingMoney: 300_000,
    inMoney: 57_000,
    outMoney: 106_100,
    differenceMoney: -7000,
    closingMoney: 243_900,
  },
};

/** A Side's month with nothing in it. */
const NO_RESULT = {
  broughtInMoney: 0,
  beforeOverheadsMoney: 0,
  overheadsMoney: 0,
  afterOverheadsMoney: 0,
  marginBeforePercent: null,
  marginAfterPercent: null,
};

const NOTHING = {
  money: { inMoney: 0, outMoney: 0, netMoney: 0, awaitingCount: 0 },
  dairy: {
    milkSoldMoney: 0,
    litersSold: 0,
    fetchedPerLiterMoney: null,
    chargedMoney: 0,
    litersToBulk: 0,
    litersPerCowMilked: null,
    costPerLiterMoney: null,
    unpricedKg: 0,
    uncostedDoses: 0,
  },
  fattening: {
    chargedMoney: 0,
    sold: 0,
    marginMoney: null,
    unpricedKg: 0,
    uncostedDoses: 0,
  },
  overheads: { amount: 0, perHeadPerDayMoney: null },
  results: {
    dairy: NO_RESULT,
    fattening: NO_RESULT,
    restOfOverheadsMoney: 0,
    farm: NO_RESULT,
  },
  atEnd: {
    receivables: {
      owingMoney: 0,
      overdueMoney: 0,
      ages: [
        { age: "0-7" as const, owingMoney: 0 },
        { age: "8-15" as const, owingMoney: 0 },
        { age: "16-30" as const, owingMoney: 0 },
        { age: "31-60" as const, owingMoney: 0 },
        { age: "over-60" as const, owingMoney: 0 },
      ],
    },
    store: { feedMoney: 0, medicineMoney: 0, totalMoney: 0, unpriced: 0 },
    cash: {
      inHandsMoney: 0,
      venturesInHandsMoney: 0,
      farmsInHandsMoney: 0,
      inAccountsMoney: 0,
      accountsNotRead: 0,
      farmsOwnMoney: 0,
    },
  },
  cashFlow: {
    openingMoney: 0,
    inMoney: 0,
    outMoney: 0,
    differenceMoney: 0,
    closingMoney: 0,
  },
};

const FACTS: MonthlyReportFacts = {
  farm: {
    name: "সবুজ ছায়া ডেইরি",
    address: "সাভার, ঢাকা",
    phone: "+8801711000098",
    registrationNumber: "DLS/SAV/2044/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  month: "2044-03",
  before: "2044-02",
  soFarTo: "2044-03-20",
  figures: FIGURES,
  figuresBefore: NOTHING,
  moneyBy: {
    category: [
      { nameBn: "দুধ বিক্রি", nameEn: "Milk sales", inMoney: 9300, outMoney: 0 },
      { nameBn: "গরু কেনা", nameEn: null, inMoney: 0, outMoney: 50_000 },
    ],
    side: [
      { side: "dairy", inMoney: 9300, outMoney: 0 },
      { side: null, inMoney: 0, outMoney: 6000 },
    ],
  },

  producedAt: { bn: "২০ মার্চ, ২০৪৪", en: "20 March 2044" },
  producedBy: "মোঃ আব্দুল করিম",
};

describe("the Monthly Report of one month, on paper", () => {
  it("is headed with the month, so far to the day, and says every part in Bangla, in Bangla numerals", () => {
    const text = paperText(monthlyReportPaper(FACTS), "bn");

    expect(text).toContain("মাসিক প্রতিবেদন — মার্চ ২০৪৪");
    expect(text).toContain("২০ মার্চ, ২০৪৪ পর্যন্ত");
    for (const part of [
      "খামারের টাকা",
      "খাত অনুযায়ী",
      "বিভাগ অনুযায়ী",
      "দুগ্ধ",
      "মোটাতাজাকরণ",
      "পরিচালন খরচ",
    ]) {
      expect(text).toContain(part);
    }
    expect(text).toContain("৮৯,৩০০");
    expect(text).toContain("ফেব্রুয়ারি ২০৪৪");
    // The figures in the paper's own numerals; the letterhead's phone and registration print as they were written.
    expect(text).not.toContain("89,300");
    expect(text).toContain("১৫০ লিটার");
  });

  it("says the same in English, the category's English name where it has one", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("Monthly report — March 2044");
    expect(text).toContain("so far, to 20 March 2044");
    expect(text).toContain("Milk sales");
    expect(text).toContain("গরু কেনা");
    expect(text).toContain("Whole farm");
    expect(text).toContain("89,300");
    expect(text).toContain("150 liters");
    for (const part of [
      "The farm's money",
      "By category, this month",
      "By side, this month",
      "Dairy",
      "Fattening",
      "Overheads",
    ]) {
      expect(text).toContain(part);
    }
  });

  it("says what the month leaves out, the money still waiting, and that each Venture keeps its own accounts", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("120 kg");
    expect(text).toContain("3 doses");
    expect(text).toContain("2 entries of money");
    expect(text).toContain("keeps its own accounts");
    expect(text).toContain("each has its own monthly report");
    const bn = paperText(monthlyReportPaper(FACTS), "bn");
    expect(bn).toContain("১২০ কেজি");
    expect(bn).toContain("৩টি ডোজ");
    expect(bn).toContain("২টি টাকার হিসাব");
  });

  it("says a figure nobody made as nothing, never a price of nought", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    // February sold no milk and no animal: its price a liter and its Margins are a dash, not ৳0.
    expect(text).toMatch(/Fetched a liter[^\n]*—/u);
    expect(text).toMatch(/Their margins[^\n]*—/u);
    expect(text).toMatch(/A head a day[^\n]*—/u);
  });

  it("says one liter as a liter, and a rate to the paisa", () => {
    const text = paperText(
      monthlyReportPaper({
        ...FACTS,
        figures: {
          ...FIGURES,
          dairy: {
            ...FIGURES.dairy,
            litersSold: 1,
            costPerLiterMoney: 29.2857,
          },
        },
      }),
      "en"
    );

    expect(text).toContain("Liters sold · 1 liter ·");
    expect(text).toContain("29.29 taka");
  });

  it("reads a whole month gone by with no 'so far'", () => {
    const text = paperText(
      monthlyReportPaper({ ...FACTS, soFarTo: null }),
      "en"
    );

    expect(text).not.toContain("so far");
  });
});

describe("what each Side came to, on paper", () => {
  it("sets each Side's month before and after its share of the overheads, its margins, the Ventures' share and the farm's", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("What each side came to, this month");
    expect(text).toContain(
      "Dairy · 9,300 taka · 5,200 taka · 55.9% · 3,000 taka · 2,200 taka · 23.7%"
    );
    expect(text).toContain(
      "The Ventures' animals' days · — · — · — · 1,000 taka · — · —"
    );
    expect(text).toContain(
      "Whole farm · 89,300 taka · 29,700 taka · 33.3% · 6,000 taka · 23,700 taka · 26.5%"
    );
  });

  it("says it in Bangla, a margin nobody made as nothing", () => {
    const text = paperText(
      monthlyReportPaper({ ...FACTS, figures: NOTHING }),
      "bn"
    );

    expect(text).toContain("প্রতিটি বিভাগের ফল, এই মাসে");
    expect(text).toContain("দুগ্ধ · ০ টাকা · ০ টাকা · — · ০ টাকা · ০ টাকা · —");
  });
});

describe("what buyers owed at the month's end, on paper", () => {
  it("sets each age beside the month before's, the whole and what of it was overdue", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("Owed at the month's end, by age");
    expect(text).toContain("8–15 days · 30,000 taka · 0 taka");
    expect(text).toContain("Over 60 days · 0 taka · 0 taka");
    expect(text).toContain("Owed in all · 36,000 taka · 0 taka");
    expect(text).toContain("Of it overdue · 6,000 taka · 0 taka");
  });

  it("says the ages in Bangla", () => {
    const text = paperText(monthlyReportPaper(FACTS), "bn");

    expect(text).toContain("মাস শেষে বাকি, কত দিনের");
    expect(text).toContain("১৬–৩০ দিন · ৬,০০০ টাকা · ০ টাকা");
    expect(text).toContain("৬০ দিনের বেশি");
  });
});

describe("what the store was worth at the month's end, on paper", () => {
  it("sets the feed, the medicine and the whole beside the month before's", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("The store at the month's end");
    expect(text).toContain("Feed · 40,000 taka · 0 taka");
    expect(text).toContain("Medicine · 5,000 taka · 0 taka");
    expect(text).toContain("The store in all · 45,000 taka · 0 taka");
  });

  it("says a kind held at no price adds nothing", () => {
    const text = paperText(monthlyReportPaper(FACTS), "bn");

    expect(text).toContain("মাস শেষে ভান্ডার");
    expect(text).toContain(
      "১টি খাদ্য বা ওষুধ মাস শেষে ভান্ডারে ছিল যার কোনো দাম নেই; ভান্ডারের হিসাবে তা ধরা হয়নি।"
    );
  });
});

describe("the farm's own money, on paper", () => {
  it("goes from where the month began to where it ended, the difference said, never hidden", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("Cash flow");
    expect(text).toContain("Where the month began · 300,000 taka · 0 taka");
    expect(text).toContain(
      "Moved without a hand or an account · -7,000 taka · 0 taka"
    );
    expect(text).toContain("Where the month ended · 243,900 taka · 0 taka");
  });

  it("sets the hands' notes apart from the Ventures', and the accounts, at the month's end", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    expect(text).toContain("The farm's own money at the month's end");
    expect(text).toContain("Notes in the hands · 221,900 taka · 0 taka");
    expect(text).toContain("Of it the ventures' · 90,000 taka · 0 taka");
    expect(text).toContain("The farm's own in all · 246,900 taka · 0 taka");
    expect(text).toContain(
      "1 farm account was not yet read once against its statement, and counts nothing."
    );
  });

  it("says it in Bangla", () => {
    const text = paperText(monthlyReportPaper(FACTS), "bn");

    expect(text).toContain("নগদের হিসাব");
    expect(text).toContain("মাস শেষে খামারের নিজের টাকা");
    expect(text).toContain(
      "১টি খামারের হিসাব এখনো একবারও বিবরণীর সাথে মেলানো হয়নি; তা শূন্য ধরা হয়েছে।"
    );
  });
});

describe("the Monthly Report of one month, a row a figure", () => {
  it("says each figure of the month and the month before as a number: whole taka, rates to the paisa, nothing for none", () => {
    const rows = monthlyReportRows(FACTS);
    const row = (en: string) => rows.find((one) => one.line.en === en);

    expect(row("Money in")).toEqual({
      part: { bn: "খামারের টাকা", en: "The farm's money" },
      line: { bn: "আয়", en: "Money in" },
      way: null,
      thisMonth: 89_300,
      monthBefore: 0,
    });
    expect(row("Liters sold")).toMatchObject({
      thisMonth: 150,
      monthBefore: 0,
    });
    expect(row("Cost a liter")).toMatchObject({
      thisMonth: 29.29,
      monthBefore: null,
    });
    expect(row("Their margins")).toMatchObject({
      thisMonth: 24_500,
      monthBefore: null,
    });
  });

  it("adds the month's money by Category and by Side, a row each way, no English where a Category has none", () => {
    const rows = monthlyReportRows(FACTS);

    expect(rows).toContainEqual({
      part: { bn: "খাত অনুযায়ী, এই মাসে", en: "By category, this month" },
      line: { bn: "গরু কেনা", en: null },
      way: "out",
      thisMonth: 50_000,
      monthBefore: null,
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        line: { bn: "পুরো খামার", en: "Whole farm" },
        way: "out",
        thisMonth: 6000,
      })
    );
  });

  it("says what the month leaves out apart from the money still waiting, which is counted in", () => {
    const rows = monthlyReportRows(FACTS);
    const of = (part: string) =>
      rows
        .filter((one) => one.part.en === part)
        .map((one) => [one.line.en, one.thisMonth, one.monthBefore]);

    expect(of("Left out")).toEqual([
      ["Fodder fed at no price", 120, 0],
      ["Doses of medicine not bought, not costed", 3, 0],
    ]);
    expect(of("Awaiting approval, counted in")).toEqual([
      ["Entries of money", 2, 0],
    ]);
  });

  it("says each Side's figures this month and the month before, its margins as percentages", () => {
    const rows = monthlyReportRows(FACTS);

    expect(rows).toContainEqual({
      part: {
        bn: "প্রতিটি বিভাগের ফল",
        en: "What each side came to",
      },
      line: {
        bn: "দুগ্ধ — পরিচালন খরচের পরে মার্জিন",
        en: "Dairy — margin after overheads",
      },
      way: null,
      thisMonth: 23.7,
      monthBefore: null,
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        line: {
          bn: "ভেঞ্চারের পশুর দিন — পরিচালন খরচের ভাগ",
          en: "The Ventures' animals' days — share of overheads",
        },
        thisMonth: 1000,
        monthBefore: 0,
      })
    );
  });

  it("says what buyers owed at each month's end by age", () => {
    const rows = monthlyReportRows(FACTS);

    expect(rows).toContainEqual({
      part: {
        bn: "মাস শেষে বাকি, কত দিনের",
        en: "Owed at the month's end, by age",
      },
      line: { bn: "১৬–৩০ দিন", en: "16–30 days" },
      way: null,
      thisMonth: 6000,
      monthBefore: 0,
    });
  });

  it("holds every line of the paper's figures, each named as the paper names it", () => {
    const text = paperText(monthlyReportPaper(FACTS), "en");

    for (const one of monthlyReportRows(FACTS).filter(
      (row) =>
        row.way === null &&
        row.part.en !== "Left out" &&
        row.part.en !== "What each side came to" &&
        !row.part.en.startsWith("Awaiting")
    )) {
      expect(text).toContain(`${one.line.en ?? ""} · `);
    }
  });
});
