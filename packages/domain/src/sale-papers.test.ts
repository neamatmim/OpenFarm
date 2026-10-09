import { describe, expect, it } from "vitest";

import { paperText } from "./paper-text";
import type { SaleReceiptFacts, TransportCardFacts } from "./sale-papers";
import { saleReceiptPaper, transportCardPaper } from "./sale-papers";

const FARM = {
  name: "সবুজ ছায়া ডেইরি",
  address: "সাভার, ঢাকা",
  phone: "+8801711000098",
  registrationNumber: "DLS/SAV/2026/1",
  registrationOffice: null,
  registrationIssuedOn: null,
  registrationExpiresOn: null,
};
const PRODUCED = {
  producedAt: { bn: "১০ জুন ২০২৬", en: "10 June 2026" },
  producedBy: "মোঃ আব্দুল করিম",
};

const RECEIPT: SaleReceiptFacts = {
  farm: FARM,
  buyer: { name: "হাজী সিরাজুল ইসলাম", address: "গাবতলী", phone: "01711000001" },
  day: "2026-06-10",
  animals: [
    { tagNumber: "F-0049", weightKg: 320.5, priceMoney: 180_000 },
    { tagNumber: "F-0050", weightKg: 300, priceMoney: 170_000 },
  ],
  receivable: {
    paidMoney: 300_000,
    owedMoney: 50_000,
    toBePaidBy: [{ tagNumber: "F-0050", day: "2026-06-20" }],
  },
  ...PRODUCED,
};

describe("the sale receipt, on paper", () => {
  it("names the buyer, tables every animal he took with the total, and leaves room for both signatures", () => {
    const text = paperText(saleReceiptPaper(RECEIPT), "en");

    expect(text).toContain("Sale receipt");
    expect(text).toContain("Name: হাজী সিরাজুল ইসলাম");
    expect(text).toContain("Date: 10 June 2026");
    expect(text).toContain("F-0049 · 320.5 · 180,000 taka");
    expect(text).toContain("Total · 350,000 taka");
    expect(text).toContain("Buyer: হাজী সিরাজুল ইসলাম");
    expect(text).toContain("Seller: সবুজ ছায়া ডেইরি");
  });

  it("says what the buyer paid, still owes, and by when — one day said once, several beside their tags", () => {
    const one = paperText(saleReceiptPaper(RECEIPT), "en");
    expect(one).toContain("Paid: 300,000 taka");
    expect(one).toContain("Still owed: 50,000 taka");
    expect(one).toContain("To be paid by: 20 June 2026");

    const several = paperText(
      saleReceiptPaper({
        ...RECEIPT,
        receivable: {
          paidMoney: 200_000,
          owedMoney: 150_000,
          toBePaidBy: [
            { tagNumber: "F-0049", day: "2026-06-20" },
            { tagNumber: "F-0050", day: null },
          ],
        },
      }),
      "en"
    );
    expect(several).toContain("To be paid by: F-0049 20 June 2026; F-0050 —");
  });

  it("puts what he still owes above his signature, and says nothing of it for a buyer who paid in full", () => {
    const owing = paperText(saleReceiptPaper(RECEIPT), "en");
    expect(owing.indexOf("Still owed")).toBeLessThan(
      owing.indexOf("Buyer: হাজী")
    );

    const paid = paperText(
      saleReceiptPaper({ ...RECEIPT, receivable: null }),
      "en"
    );
    expect(paid).not.toContain("Still owed");
    expect(paid).not.toContain("To be paid by");
  });

  it("reads wholly in Bangla", () => {
    const text = paperText(saleReceiptPaper(RECEIPT), "bn");

    expect(text).toContain("বিক্রয় রসিদ");
    expect(text).toContain("৩,৫০,০০০ টাকা");
    expect(text).not.toContain("Sale receipt");
  });

  it("refuses a receipt with no animals on it", () => {
    expect(() => saleReceiptPaper({ ...RECEIPT, animals: [] })).toThrow();
  });
});

const CARD: TransportCardFacts = {
  farm: FARM,
  buyerName: "হাজী সিরাজুল ইসলাম",
  destination: "গাবতলী পশুর হাট",
  vehicle: "ঢাকা মেট্রো ট ১১-২২৩৩",
  driver: "মো. রহিম",
  at: new Date("2026-06-10T02:30:00.000Z"),
  tagNumbers: ["F-0049", "F-0050"],
  ...PRODUCED,
};

describe("the transport card, on paper", () => {
  it("says the rule it is made under, where the load goes, on what and with whom, and the animals by tag", () => {
    const text = paperText(transportCardPaper(CARD), "en");

    expect(text).toContain("Animal transport card");
    expect(text).toContain("Meat Rules 2021, rule 18");
    expect(text).toContain("Destination: গাবতলী পশুর হাট");
    expect(text).toContain("Vehicle: ঢাকা মেট্রো ট ১১-২২৩৩");
    expect(text).toContain("Animals: 2");
    expect(text).toContain("Tag numbers: F-0049, F-0050");
    expect(text).toContain("DLS/SAV/2026/1");
  });

  it("reads wholly in Bangla, its count in Bangla numerals", () => {
    const text = paperText(transportCardPaper(CARD), "bn");

    expect(text).toContain("পশু পরিবহন কার্ড");
    expect(text).toContain("পশুর সংখ্যা: ২");
  });

  it("refuses a card without the farm's registration number, or with no animals", () => {
    expect(() =>
      transportCardPaper({
        ...CARD,
        farm: { ...FARM, registrationNumber: null },
      })
    ).toThrow();
    expect(() => transportCardPaper({ ...CARD, tagNumbers: [] })).toThrow();
  });
});

const PAPERS = () => [saleReceiptPaper(RECEIPT), transportCardPaper(CARD)];

describe("both papers that go with a buyer", () => {
  it("gives every row and every total one cell to each column", () => {
    for (const section of PAPERS().flatMap((one) => one.sections)) {
      if (section.kind === "table") {
        for (const line of [
          ...section.rows,
          ...(section.foot ? [section.foot] : []),
        ]) {
          expect(line).toHaveLength(section.columns.length);
        }
      }
    }
  });
});
