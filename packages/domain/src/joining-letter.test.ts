import { describe, expect, it } from "vitest";

import type { JoiningLetterFacts } from "./joining-letter";
import { joiningLetterPaper } from "./joining-letter";
import { paperText } from "./paper-text";

// The যোগদানপত্র as a paper read in Bangla or in English (ADR 0021): every figure, day and word the farm writes said in
// the language it is read in, its terms included — which a letter of lines once printed in Bangla alone.

const FACTS: JoiningLetterFacts = {
  farm: {
    name: "সবুজ খামার",
    address: "সাভার, ঢাকা",
    phone: "01711000000",
    registrationNumber: "DLS-123",
  } as JoiningLetterFacts["farm"],
  him: {
    name: "রহিম",
    phone: "01811000000",
    address: null,
    nid: "1985220788",
    nominees: [
      {
        name: "রহিমা",
        relation: "স্ত্রী",
        phone: null,
        bornOn: "1982-03-14",
        nid: "1982 4417 2093",
        birthRegistration: null,
        sharePercent: 100,
        receiver: null,
        minor: false,
      },
    ],
  },
  ventureName: "ঈদ ২০২৭",
  unitPriceMoney: 50_000,
  units: 3,
  capital: [
    {
      kind: "received",
      amountMoney: 150_000,
      movedOn: "2026-07-03",
      reference: "TRF-1",
    },
  ],
  totalCapitalMoney: 150_000,
  terms: [
    {
      heading: { bn: "শর্তাবলি", en: "Terms" },
      clauses: [
        {
          bn: "এটি একটি মুদারাবা চুক্তি।",
          en: "This is a mudarabah.",
        },
      ],
    },
  ],
  monthlySums: null,
  amendedOn: null,
  stamp: { kind: "paper", valueMoney: 300, on: "2026-07-03", serial: "AA-1" },
  ownerName: "করিম",
  producedBy: "করিম",
  producedAt: { bn: "৮ অক্টোবর, ২০২৬", en: "8 October 2026" },
};

describe("the joining letter, read in either language", () => {
  it("says its figures, days and terms in English when read in English", () => {
    const english = paperText(joiningLetterPaper(FACTS), "en");

    expect(english).toContain("Investor joining letter");
    expect(english).toContain("50,000 taka");
    expect(english).toContain("3 July 2026 · TRF-1 · 150,000 taka");
    expect(english).toContain("1. This is a mudarabah.");
    expect(english).toContain("Wife");
    expect(english).toContain("Stamp value: 300 taka");
    expect(english).toContain("No return is guaranteed.");
    // No Bangla numeral in anything the farm wrote.
    expect(english.replaceAll("ঈদ ২০২৭", "")).not.toMatch(/[০-৯]/u);
  });

  it("says the same in Bangla, in Bangla numerals", () => {
    const bangla = paperText(joiningLetterPaper(FACTS), "bn");

    expect(bangla).toContain("যোগদানপত্র");
    expect(bangla).toContain("৫০,০০০ টাকা");
    expect(bangla).toContain("১. এটি একটি মুদারাবা চুক্তি।");
  });

  it("says the terms are as amended, on the day they were", () => {
    const amended = joiningLetterPaper({ ...FACTS, amendedOn: "2026-09-01" });

    expect(paperText(amended, "en")).toContain(
      "The terms below are as amended on 1 September 2026."
    );
  });

  it("refuses to acknowledge capital that has not arrived", () => {
    expect(() => joiningLetterPaper({ ...FACTS, capital: [] })).toThrow(
      /has not arrived/u
    );
  });
});
