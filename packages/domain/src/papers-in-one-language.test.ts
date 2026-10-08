import { describe, expect, it } from "vitest";

import type { FieldValues, PaperParties } from "./paper-template";
import { paperFrom, readingOf, termsOf, wordingFor } from "./paper-template";
import { inLanguage } from "./papers";
import {
  STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS,
  STANDARD_TEMPLATES,
} from "./standard-templates";

// A paper is read in Bangla or in English, as its reader chooses (ADR 0021): everything it writes is said in both,
// each language with its own numerals, and an English left empty is read in Bangla so nothing goes blank.

const PARTIES: PaperParties = {
  farm: {
    name: "সবুজ খামার",
    address: "সাভার, ঢাকা",
    phone: "01711000000",
    registrationNumber: "DLS-123",
  } as PaperParties["farm"],
  ownerName: "করিম",
  investors: [
    {
      name: "রহিম",
      phone: "01811000000",
      address: null,
      nid: "1985220788",
      nominees: [],
    },
  ],
};

const VALUES: FieldValues = {
  ventureName: { bn: "ঈদ ২০২৭", en: "ঈদ ২০২৭" },
  units: { bn: "১২", en: "12" },
  unitPrice: { bn: "৫০,০০০", en: "50,000" },
  capital: { bn: "৬,০০,০০০", en: "600,000" },
  windowStart: { bn: "৭ মার্চ, ২০২৭", en: "7 March 2027" },
  windowEnd: { bn: "১৭ মার্চ, ২০২৭", en: "17 March 2027" },
  windUpDays: { bn: "৩০", en: "30" },
};

const agreementWith = (content = STANDARD_TEMPLATES.investment_agreement) =>
  paperFrom(wordingFor(content, { paidByTheMonth: false }), {
    kind: "investment_agreement",
    parties: PARTIES,
    values: VALUES,
    producedBy: "করিম",
    producedAt: { bn: "৮ অক্টোবর, ২০২৬", en: "8 October 2026" },
    version: 3,
  });

const factsOf = (paper: ReturnType<typeof agreementWith>) =>
  paper.sections.flatMap((section) =>
    section.kind === "facts"
      ? section.rows.map((row) => ({
          bn: inLanguage(row.value, "bn"),
          en: inLanguage(row.value, "en"),
        }))
      : []
  );

describe("a paper said in both languages", () => {
  it("writes each fact in each language with its own numerals and words", () => {
    const facts = factsOf(agreementWith());

    expect(facts).toContainEqual({ bn: "৫০,০০০ টাকা", en: "50,000 taka" });
    expect(facts).toContainEqual({ bn: "৩০ দিন", en: "30 days" });
    expect(facts).toContainEqual({
      bn: "৭ মার্চ, ২০২৭ – ১৭ মার্চ, ২০২৭",
      en: "7 March 2027 – 17 March 2027",
    });
  });

  it("reads a standard fact worded in Bangla alone in English all the same, as every older Version holds it", () => {
    const facts = factsOf(
      agreementWith(STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS)
    );

    expect(facts).toContainEqual({ bn: "৫০,০০০ টাকা", en: "50,000 taka" });
  });

  it("reads a fact the Owner worded in Bangla alone in Bangla, rather than going blank", () => {
    const own = wordingFor(STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS, {
      paidByTheMonth: false,
    });
    const content = {
      ...own,
      sections: own.sections.map((section) =>
        section.kind === "facts"
          ? {
              ...section,
              rows: [
                {
                  label: { bn: "দাম", en: "Price" },
                  value: "{unitPrice} টাকা মাত্র",
                },
              ],
            }
          : section
      ),
    };

    expect(factsOf(agreementWith(content))).toContainEqual({
      bn: "৫০,০০০ টাকা মাত্র",
      en: "৫০,০০০ টাকা মাত্র",
    });
  });

  it("says its letterhead, its foot and its closing in each language", () => {
    const paper = agreementWith();

    expect(
      paper.letterhead.details.map((line) => inLanguage(line, "en"))
    ).toEqual(["সাভার, ঢাকা", "Phone: 01711000000", "DLS registration: DLS-123"]);
    expect(inLanguage(paper.produced, "en")).toBe(
      "8 October 2026 · করিম · Version 3"
    );
    expect(inLanguage(paper.produced, "bn")).toBe(
      "৮ অক্টোবর, ২০২৬ · করিম · সংস্করণ ৩"
    );
    expect(paper.closing.map((line) => inLanguage(line, "en"))).toEqual([
      "No return is guaranteed. A loss comes off capital.",
    ]);
  });

  it("prints the Portal Consent's English, which was once left off", () => {
    const consent = paperFrom(STANDARD_TEMPLATES.portal_consent, {
      kind: "portal_consent",
      parties: PARTIES,
      values: {},
      producedBy: "করিম",
      producedAt: { bn: "৮ অক্টোবর, ২০২৬", en: "8 October 2026" },
    });

    expect(consent.preamble.en).toContain("I,");
  });

  it("numbers the terms in the language they are read in", () => {
    const content = wordingFor(STANDARD_TEMPLATES.investment_agreement, {
      paidByTheMonth: false,
    });

    expect(termsOf(content, VALUES, "en")[0]).toMatch(/^1\. [A-Z]/u);
    expect(termsOf(content, VALUES, "bn")[0]).toMatch(/^১\. /u);
  });

  it("reads the notice as a page in English", () => {
    const page = readingOf(STANDARD_TEMPLATES.privacy_notice, {}, "en");

    expect(page.title).toBe("How the farm keeps your data");
    expect(page.parts[0]?.heading).toBe("Who keeps it");
  });
});
