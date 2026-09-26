import { describe, expect, it } from "vitest";

import type { PaperParties, TemplateContent } from "./paper-template";
import {
  TEMPLATE_KINDS,
  factsMissing,
  readingOf,
  namedFields,
  paperFrom,
  templateProblems,
  termsOf,
} from "./paper-template";
import {
  FIRST_PRINTED_AGREEMENT,
  STANDARD_TEMPLATES,
} from "./standard-templates";

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

const agreement = STANDARD_TEMPLATES.investment_agreement;

const SALMA = {
  name: "সালমা",
  relation: "মেয়ে",
  phone: "01911000000",
  bornOn: "1990-05-06",
  sharePercent: 100,
  minor: false,
  receiver: null,
};

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
    const [parties] = agreement.sections;
    const stamp = agreement.sections.find(
      (section) => section.kind === "stamp"
    );
    if (!(parties && stamp)) {
      throw new Error("the standard agreement has its parties and a stamp");
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

    expect(terms).toHaveLength(14);
    expect(terms[1]).toBe(
      "২. মুনাফা ভাগ হবে বিনিয়োগকারী ৫৫% এবং খামার ৪৫%, মূলধন সম্পূর্ণ ফেরতের পর।"
    );
  });

  it("repeat each later part under its own heading, numbered as the Agreement numbers it", () => {
    const terms = termsOf(agreement, {});

    expect(terms[7]).toBe("তথ্য");
    expect(terms[8]).toMatch(/^১\. এই চুক্তি পালন করতে/u);
    expect(terms[12]).toMatch(/^৫\. বিনিয়োগকারী যেকোনো সময় মালিককে লিখে/u);
  });

  it("never repeat the lines under the nominee, which are about who signs", () => {
    const terms = termsOf(agreement, {}).join("\n");

    expect(terms).not.toContain("নমিনি জানেন");
    expect(terms).not.toContain("আঠারো");
  });
});

describe("the Investment Agreement's data section and nominee lines", () => {
  /** The laid-out paper's parts, for an Investor with Nominees or without. */
  const laidOutFor = (nominees: PaperParties["investors"][0]["nominees"]) =>
    paperFrom(agreement, {
      kind: "investment_agreement",
      parties: {
        ...PARTIES,
        investors: [{ ...PARTIES.investors[0], nominees }],
      },
      values: {},
      producedBy: "করিম",
      producedAt: "২৬ সেপ্টেম্বর ২০২৬",
    }).sections;

  it("comes after the terms and before the stamp, headed তথ্য / Data, in the draft's six clauses", () => {
    const kinds = agreement.sections.map((section) =>
      section.kind === "clauses" ? section.heading.en : section.kind
    );
    const data = agreement.sections.find(
      (section) => section.kind === "clauses" && section.heading.bn === "তথ্য"
    );
    if (data?.kind !== "clauses") {
      throw new Error("expected the data section");
    }

    expect(kinds).toEqual([
      "parties",
      "facts",
      "Terms",
      "Data",
      "stamp",
      "signatures",
    ]);
    expect(data.heading).toEqual({ bn: "তথ্য", en: "Data" });
    expect(data.clauses).toHaveLength(6);
    expect(data.clauses[1]?.en).toBe(
      "This data is kept on a server in Singapore run for the Farm, and an encrypted copy is kept elsewhere each night."
    );
    expect(data.clauses[5]?.bn).toContain("আলাদা সম্মতিপত্রে সই করলে");
  });

  it("prints the two nominee lines under the Investor, not the Farm, whether or not he has Nominees", () => {
    for (const nominees of [[], [SALMA]]) {
      const parties = laidOutFor(nominees).find(
        (section) => section.kind === "parties"
      );
      if (parties?.kind !== "parties") {
        throw new Error("expected the parties");
      }
      const [farm, him] = parties.parties;

      expect(farm?.lines).toEqual([]);
      expect(him?.lines).toHaveLength(2);
      expect(him?.lines[0]?.en).toContain("their nominee knows");
      // The under-eighteen line every time, to be struck through by hand where it does not apply.
      expect(him?.lines[1]?.bn).toContain("নমিনির বয়স আঠারো বছরের কম");
      expect(him?.lines[1]?.en).toContain("Signature: ____________");
    }
  });

  it("prints his Nominees as a table under him, a minor marked with who collects for her, and none under the Farm", () => {
    const parties = laidOutFor([
      { ...SALMA, sharePercent: 80 },
      {
        name: "তানিয়া",
        relation: "নাতনি",
        phone: null,
        bornOn: "2015-01-02",
        sharePercent: 20,
        minor: true,
        receiver: { name: "সালমা", relation: "মা", phone: "01911000000" },
      },
    ]).find((section) => section.kind === "parties");
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties");
    }
    const [farm, him] = parties.parties;

    expect(farm?.nominees).toEqual([]);
    expect(him?.nominees).toEqual([
      {
        name: "সালমা",
        relation: "মেয়ে",
        born: expect.stringContaining("১৯৯০"),
        minor: false,
        phone: "01911000000",
        share: "৮০%",
        receiver: null,
      },
      {
        name: "তানিয়া",
        relation: "নাতনি",
        born: expect.stringContaining("২০১৫"),
        minor: true,
        phone: null,
        share: "২০%",
        receiver: "সালমা (মা), 01911000000",
      },
    ]);
    expect(him?.rows.map((row) => row.label.en)).not.toContain("Nominee");
  });

  it("checks the nominee lines as it checks a clause", () => {
    const [parties, ...rest] = agreement.sections;
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties first");
    }
    const broken: TemplateContent = {
      ...agreement,
      sections: [
        {
          ...parties,
          nomineeLines: [
            { bn: "", en: "Nominee" },
            { bn: "{nomineeAge}", en: "" },
          ],
        },
        ...rest,
      ],
    };

    expect(templateProblems("investment_agreement", broken)).toEqual([
      { code: "text_missing", at: 1 },
      { code: "unknown_field", at: 1, about: "nomineeAge" },
    ]);
  });

  it("lays out a parties part worded before it had nominee lines with none", () => {
    const [parties, ...rest] = STANDARD_TEMPLATES.master_agreement.sections;
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties first");
    }
    const { nomineeLines: _none, ...before } = parties;
    const paper = paperFrom(
      { ...STANDARD_TEMPLATES.master_agreement, sections: [before, ...rest] },
      {
        kind: "master_agreement",
        parties: PARTIES,
        values: {},
        producedBy: "",
        producedAt: "",
      }
    );
    const laid = paper.sections.find((section) => section.kind === "parties");

    expect(
      laid?.kind === "parties" && laid.parties.map((one) => one.lines)
    ).toEqual([[], []]);
  });

  it("leaves the Agreement the farm printed before its wording could be edited as it was", () => {
    expect(
      FIRST_PRINTED_AGREEMENT.sections.map((section) => section.kind)
    ).toEqual(["parties", "facts", "clauses", "stamp", "signatures"]);
    expect(JSON.stringify(FIRST_PRINTED_AGREEMENT)).not.toContain("নমিনি জানেন");
    expect(
      templateProblems("investment_agreement", FIRST_PRINTED_AGREEMENT)
    ).toEqual([]);
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

describe("a notice read as a page", () => {
  const notice = STANDARD_TEMPLATES.privacy_notice;

  it("is its wording in Bangla, filled: a title, an opening, and each part with its lines", () => {
    const read = readingOf(notice, {
      farmName: { bn: "সবুজ খামার", en: "Sobuj Farm" },
    });

    expect(read.title).toBe("আপনার তথ্য খামার কীভাবে রাখে");
    expect(read.preamble).toContain("সবুজ খামার");
    expect(read.parts[0]?.heading).toBe("কে রাখে");
    expect(read.parts.length).toBe(
      notice.sections.filter((section) => section.kind === "clauses").length
    );
  });

  it("reads a facts part too, each line as its label and what it says", () => {
    const read = readingOf(
      {
        ...notice,
        sections: [
          {
            kind: "facts",
            heading: { bn: "সংক্ষেপে", en: "" },
            rows: [{ label: { bn: "খামার", en: "" }, value: "{farmName}" }],
            note: null,
          },
        ],
      },
      { farmName: { bn: "সবুজ খামার", en: "Sobuj Farm" } }
    );

    expect(read.parts).toEqual([
      { heading: "সংক্ষেপে", lines: ["খামার: সবুজ খামার"] },
    ]);
  });
});
