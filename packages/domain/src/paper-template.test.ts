import { describe, expect, it } from "vitest";

import type { PaperParties, TemplateContent } from "./paper-template";
import {
  TEMPLATE_KINDS,
  factsMissing,
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
    kind: "investment_agreement",
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
      kind: "agreement_amendment",
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
      kind: "investment_agreement",
      parties: PARTIES,
      values: namedFields("investment_agreement"),
      producedBy: "",
      producedAt: "",
    });

    expect(JSON.stringify(shown)).toContain("[সালিস]");
    expect(JSON.stringify(shown)).toContain("[Arbitrator]");
  });
});

/** A Version's wording with only its clauses: no parties, no signatures. */
const clausesOnly = (content: TemplateContent) => ({
  ...content,
  sections: content.sections.filter((section) => section.kind === "clauses"),
});

describe("the Portal Consent and the privacy notice", () => {
  const consent = STANDARD_TEMPLATES.portal_consent;
  const notice = STANDARD_TEMPLATES.privacy_notice;
  const madeAs = (kind: "portal_consent" | "privacy_notice") =>
    paperFrom(STANDARD_TEMPLATES[kind], {
      kind,
      parties: PARTIES,
      values: {},
      producedBy: "করিম",
      producedAt: "২৬ সেপ্টেম্বর ২০২৬",
    });

  it("asks a notice for no parties and no signatures, and a consent only for its signatures", () => {
    expect(templateProblems("privacy_notice", clausesOnly(notice))).toEqual([]);
    expect(
      templateProblems("portal_consent", clausesOnly(consent))
    ).toContainEqual({
      code: "part_missing",
      at: "title",
      about: "signatures",
    });
    expect(
      templateProblems("portal_consent", clausesOnly(consent))
    ).not.toContainEqual(expect.objectContaining({ about: "parties" }));
  });

  it("closes only a paper about an Investor's money on the lines that promise no return", () => {
    const anAgreement = paperFrom(agreement, {
      kind: "investment_agreement",
      parties: PARTIES,
      values: {},
      producedBy: "করিম",
      producedAt: "২৬ সেপ্টেম্বর ২০২৬",
    });

    expect(anAgreement.closing.length).toBeGreaterThan(0);
    expect(madeAs("privacy_notice").closing).toEqual([]);
    expect(madeAs("portal_consent").closing).toEqual([]);
  });

  it("is handed over in Bangla: the English is printed on the title alone", () => {
    const paper = madeAs("privacy_notice");
    const englishPrinted = paper.sections.flatMap((section) =>
      section.kind === "clauses"
        ? [section.heading.en, ...section.clauses.map((one) => one.en)]
        : []
    );

    expect(paper.title.en).toBe("How the farm keeps your data");
    expect(paper.preamble.en).toBe("");
    expect(englishPrinted.every((line) => line === "")).toBe(true);
  });

  it("says in its foot which Version of the wording it was printed from", () => {
    const paper = paperFrom(consent, {
      kind: "portal_consent",
      parties: PARTIES,
      values: {},
      producedBy: "করিম",
      producedAt: "২৬ সেপ্টেম্বর ২০২৬",
      version: 2,
    });

    expect(paper.produced).toBe(
      "২৬ সেপ্টেম্বর ২০২৬ · করিম · সংস্করণ ২ / Version 2"
    );
  });

  it("refuses a stamp on a consent or a notice, and parties or signatures on a notice", () => {
    const withStamp: TemplateContent = {
      ...consent,
      sections: [
        ...consent.sections,
        { kind: "stamp", heading: { bn: "স্ট্যাম্প", en: "" } },
      ],
    };

    expect(templateProblems("portal_consent", withStamp)).toContainEqual({
      code: "part_not_here",
      at: withStamp.sections.length,
      about: "stamp",
    });
    expect(
      templateProblems("privacy_notice", {
        ...notice,
        sections: [...notice.sections, ...consent.sections],
      })
    ).toContainEqual(
      expect.objectContaining({ code: "part_not_here", about: "signatures" })
    );
  });

  it("has a consent signed and dated by the Investor first, and countersigned by the Owner", () => {
    const signatures = madeAs("portal_consent").sections.find(
      (section) => section.kind === "signatures"
    );
    if (signatures?.kind !== "signatures") {
      throw new Error("expected the signatures");
    }

    expect(signatures.signers).toEqual([
      { role: { bn: "বিনিয়োগকারী", en: "" }, name: "রহিম" },
      { role: { bn: "মালিক (সামনে সই হয়েছে)", en: "" }, name: "করিম" },
    ]);
    expect(signatures.dateBlank).toEqual({ bn: "তারিখ", en: "" });
    expect(signatures.witnesses).toEqual([]);
  });

  it("names each fact the wording asks for that nobody has filled, once, among the facts asked about", () => {
    const missing = factsMissing(notice, {
      farmName: { bn: "সবুজ খামার", en: "Sobuj Farm" },
      dataHost: { bn: "হোস্ট", en: "Host" },
    });
    const theInvestors = factsMissing(consent, {}, ["investorName"]);

    expect(missing).toContain("backupStore");
    expect(missing).toContain("backupCountry");
    expect(missing).not.toContain("farmName");
    expect(missing).not.toContain("dataHost");
    expect(new Set(missing).size).toBe(missing.length);
    expect(theInvestors).toEqual(["investorName"]);
  });
});
