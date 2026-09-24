import { describe, expect, it } from "vitest";

import type { PaperParties, TemplateContent } from "./paper-template";
import {
  TEMPLATE_KINDS,
  namedFields,
  paperFrom,
  templateProblems,
  termsOf,
} from "./paper-template";
import { STANDARD_TEMPLATES } from "./standard-templates";

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
      nominee: null,
    },
  ],
};

const agreement = STANDARD_TEMPLATES.investment_agreement;

describe("the standard wording", () => {
  it("publishes as it is, every kind of it", () => {
    for (const kind of TEMPLATE_KINDS) {
      expect(templateProblems(kind, STANDARD_TEMPLATES[kind])).toEqual([]);
    }
  });

  it("gives a Master Agreement no Venture of its own to name", () => {
    const naming = {
      ...STANDARD_TEMPLATES.master_agreement,
      title: { bn: "{ventureName} চুক্তি", en: "" },
    };

    expect(templateProblems("master_agreement", naming)).toContainEqual({
      code: "unknown_field",
      at: "title",
      about: "ventureName",
    });
  });
});

describe("what stops a Version being published", () => {
  it("is a field the paper does not have, Bangla left empty, or a part missing or twice", () => {
    const [parties, facts, clauses, stamp, signatures] = agreement.sections;
    if (!(parties && facts && clauses && stamp && signatures)) {
      throw new Error("the standard agreement has five parts");
    }
    const broken: TemplateContent = {
      ...agreement,
      sections: [
        parties,
        {
          kind: "clauses",
          heading: { bn: "", en: "Terms" },
          clauses: [{ bn: "দাম {pricePerKg}", en: "" }],
        },
        stamp,
        stamp,
      ],
    };

    expect(templateProblems("investment_agreement", broken)).toEqual([
      { code: "text_missing", at: 2 },
      { code: "unknown_field", at: 2, about: "pricePerKg" },
      { code: "part_twice", at: 4, about: "stamp" },
      { code: "part_missing", at: "title", about: "signatures" },
    ]);
  });

  it("does not ask for English: the Bangla is the paper", () => {
    const banglaOnly: TemplateContent = {
      ...agreement,
      title: { bn: agreement.title.bn, en: "" },
    };

    expect(templateProblems("investment_agreement", banglaOnly)).toEqual([]);
  });
});

describe("a paper filled from a Version", () => {
  const paper = paperFrom(agreement, {
    parties: PARTIES,
    values: {
      investorsPercent: { bn: "৬০", en: "60" },
      farmPercent: { bn: "৪০", en: "40" },
      arbitrator: { bn: "মাওলানা আব্দুল", en: "Maulana Abdul" },
    },
    producedBy: "করিম",
    producedAt: "২৪ সেপ্টেম্বর ২০২৬",
  });
  const terms = paper.sections.find((section) => section.kind === "clauses");

  it("fills each field in the language it is written in", () => {
    if (terms?.kind !== "clauses") {
      throw new Error("expected the terms");
    }
    expect(terms.clauses[1]?.bn).toContain("বিনিয়োগকারী ৬০% এবং খামার ৪০%");
    expect(terms.clauses[1]?.en).toContain("60% to the Investor");
  });

  it("leaves a blank to write in where the farm has nothing to say", () => {
    if (terms?.kind !== "clauses") {
      throw new Error("expected the terms");
    }
    expect(terms.clauses[4]?.bn).toBe(
      "বিক্রয়ের লক্ষ্য সময়: ____________ থেকে ____________।"
    );
  });

  it("writes the parties from what the farm holds, and signs them by the paper's own words for them", () => {
    const signatures = paper.sections.find(
      (section) => section.kind === "signatures"
    );
    if (signatures?.kind !== "signatures") {
      throw new Error("expected the signatures");
    }
    expect(signatures.signers).toEqual([
      { role: { bn: "প্রথম পক্ষ", en: "First party" }, name: "করিম" },
      { role: { bn: "দ্বিতীয় পক্ষ", en: "Second party" }, name: "রহিম" },
    ]);
    expect(signatures.witnesses.map((one) => one.bn)).toEqual([
      "সাক্ষী ১",
      "সাক্ষী ২",
    ]);
    expect(paper.closing.length).toBeGreaterThan(0);
  });
});

describe("an Amendment", () => {
  it("is one paper every Investor on the Venture signs", () => {
    const [first] = PARTIES.investors;
    const everybody: PaperParties = {
      ...PARTIES,
      investors: [first, { ...first, name: "সালমা", nid: null }],
    };
    const paper = paperFrom(STANDARD_TEMPLATES.agreement_amendment, {
      parties: everybody,
      values: {},
      producedBy: "",
      producedAt: "",
    });
    const parties = paper.sections.find(
      (section) => section.kind === "parties"
    );
    const signatures = paper.sections.find(
      (section) => section.kind === "signatures"
    );
    if (parties?.kind !== "parties" || signatures?.kind !== "signatures") {
      throw new Error("expected the parties and the signatures");
    }

    expect(parties.parties).toHaveLength(3);
    expect(signatures.signers.map((one) => one.name)).toEqual([
      "করিম",
      "রহিম",
      "সালমা",
    ]);
  });
});

describe("the terms a letter repeats", () => {
  it("are the Version's clauses in Bangla, numbered, filled from the terms in force", () => {
    const terms = termsOf(agreement, {
      investorsPercent: { bn: "৫৫", en: "55" },
      farmPercent: { bn: "৪৫", en: "45" },
    });

    expect(terms).toHaveLength(7);
    expect(terms[1]).toBe(
      "২. মুনাফা ভাগ হবে বিনিয়োগকারী ৫৫% এবং খামার ৪৫%, মূলধন সম্পূর্ণ ফেরতের পর।"
    );
  });
});

describe("a Version previewed before any paper is filled from it", () => {
  it("shows each field by its own name", () => {
    const shown = paperFrom(agreement, {
      parties: PARTIES,
      values: namedFields("investment_agreement"),
      producedBy: "",
      producedAt: "",
    });

    expect(JSON.stringify(shown)).toContain("[সালিস]");
    expect(JSON.stringify(shown)).toContain("[Arbitrator]");
  });
});
