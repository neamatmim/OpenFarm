import { describe, expect, it } from "vitest";

import type { PaperParties, TemplateKind } from "./paper-template";
import {
  paperFrom,
  templateProblems,
  termsOf,
  wordingFor,
} from "./paper-template";
import type { PaperOrganization } from "./papers";
import { joiningLetter } from "./papers";
import {
  PORTAL_CONSENT_BEFORE_ORGANIZATIONS,
  STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
  STANDARD_TEMPLATES,
} from "./standard-templates";

// The wording for an Organization (ADR 0020) added to the standard Investment Agreement and Portal Consent on
// 2026-10-08, printed for an Organization only — so a person's paper, laid out from the new standard, is the paper the
// standard before it laid out, to the letter.

const FARM = {
  name: "সবুজ খামার",
  address: "সাভার, ঢাকা",
  phone: "01711000000",
  registrationNumber: "DLS-123",
} as PaperParties["farm"];

const PERSON: PaperParties["investors"][0] = {
  name: "রহিম",
  phone: "01811000000",
  address: "সাভার",
  nid: "1985220788",
  nominees: [],
};

const ORGANIZATION: PaperOrganization = {
  tradeLicense: "TRAD/DNCC/1",
  rjscNumber: "C-1",
  tin: "1234",
  authority: "পরিচালনা পর্ষদের সিদ্ধান্ত",
  authorityOn: "২০ সেপ্টেম্বর, ২০২৬",
  signatory: { name: "রফিক", role: "পরিচালক", nid: "1990123" },
};

const laidOut = (
  kind: TemplateKind,
  content: (typeof STANDARD_TEMPLATES)[TemplateKind],
  paidByTheMonth: boolean
) =>
  paperFrom(wordingFor(content, { paidByTheMonth, farmCapital: true }), {
    kind,
    parties: { farm: FARM, ownerName: "করিম", investors: [PERSON] },
    values: {
      investorName: { bn: PERSON.name, en: PERSON.name },
      signerName: { bn: PERSON.name, en: PERSON.name },
    },
    producedBy: "করিম",
    producedAt: "৮ অক্টোবর ২০২৬",
  });

/** The terms a joining letter repeats, from one wording, for a person or an Organization. */
const termsFor = (
  content: typeof STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
  organization?: boolean
) =>
  termsOf(wordingFor(content, { paidByTheMonth: true, organization }), {}).join(
    "\n"
  );

describe("the standard wording of 2026-10-08", () => {
  it("publishes as it is", () => {
    expect(
      templateProblems(
        "investment_agreement",
        STANDARD_TEMPLATES.investment_agreement
      )
    ).toEqual([]);
    expect(
      templateProblems("portal_consent", STANDARD_TEMPLATES.portal_consent)
    ).toEqual([]);
  });

  it("lays a person's Agreement out to the letter as the standard before it did, paid by the month or not", () => {
    for (const paidByTheMonth of [true, false]) {
      expect(
        laidOut(
          "investment_agreement",
          STANDARD_TEMPLATES.investment_agreement,
          paidByTheMonth
        )
      ).toEqual(
        laidOut(
          "investment_agreement",
          STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
          paidByTheMonth
        )
      );
    }
  });

  it("gives a person's joining letter the terms the standard before it gave, and an Organization its own", () => {
    expect(termsFor(STANDARD_TEMPLATES.investment_agreement)).toBe(
      termsFor(STANDARD_AGREEMENT_WITH_FARM_CAPITAL)
    );
    const its = termsFor(STANDARD_TEMPLATES.investment_agreement, true);
    expect(its).toContain("বিনিয়োগকারী একটি প্রতিষ্ঠান");
    expect(its).not.toContain("বিনিয়োগকারীর মৃত্যু হলে");
  });

  it("lays a person's Portal Consent out to the letter as the one before it did", () => {
    expect(
      laidOut("portal_consent", STANDARD_TEMPLATES.portal_consent, false)
    ).toEqual(
      laidOut("portal_consent", PORTAL_CONSENT_BEFORE_ORGANIZATIONS, false)
    );
  });
});

describe("an Organization's joining letter", () => {
  const letter = (organization: PaperOrganization | null) =>
    joiningLetter({
      farm: FARM,
      him: {
        name: "মেঘনা ডেইরি লিমিটেড",
        phone: "01833445566",
        address: "মতিঝিল",
        nid: null,
        organization,
        nominees: [],
      },
      ventureName: "ঈদ ২০২৭",
      unitPrice: "৫০,০০০",
      units: "২",
      capital: [
        {
          kind: "received",
          amount: "১,০০,০০০",
          on: "১ অক্টোবর, ২০২৬",
          reference: "TRX-1",
        },
      ],
      totalCapital: "১,০০,০০০",
      terms: [],
      amendedOn: null,
      stamp: {
        kind: "paper",
        value: "৩০০",
        on: "১ অক্টোবর, ২০২৬",
        serial: "AA 1",
      },
      producedBy: "করিম",
      producedAt: "৮ অক্টোবর ২০২৬",
    } as unknown as Parameters<typeof joiningLetter>[0]);

  it("names the Organization, its papers and its Signatory, who signs for it", () => {
    const text = letter(ORGANIZATION);
    expect(text).toContain("বিনিয়োগকারী প্রতিষ্ঠান");
    expect(text).toContain("TRAD/DNCC/1");
    expect(text).toContain("রফিক, পরিচালক");
    expect(text).toContain("বিনিয়োগকারী প্রতিষ্ঠানের পক্ষে স্বাক্ষর");
    expect(text).not.toContain("নমিনি");
  });
});
