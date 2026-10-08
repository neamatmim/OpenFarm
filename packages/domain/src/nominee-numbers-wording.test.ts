import { describe, expect, it } from "vitest";

import type { TemplateContent } from "./paper-template";
import { templateProblems } from "./paper-template";
import {
  NOMINATION_BEFORE_NOMINEE_NUMBERS,
  PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
  STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS,
  STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
  STANDARD_TEMPLATES,
} from "./standard-templates";

// Nominees give their NID, or a minor their birth registration, and a minor's Receiver their NID (the Owner,
// 2026-10-08): the standard wording says the farm holds them, and the standard before it is kept to the letter.

const said = (content: TemplateContent) => JSON.stringify(content);

/** A wording's parts with the lines printed beside the Nominee table left out. */
const apartFromTheNomineeLines = (content: TemplateContent) =>
  content.sections.map((section) =>
    section.kind === "parties"
      ? { ...section, nomineeLines: [], receiverLine: null }
      : section
  );

const NOMINEE_HOLDS =
  "date of birth, phone and NID number — a minor's birth registration number";
const RECEIVER_CONSENTS = "consent to their data and my NID number being kept";

describe("the wording once Nominees give their numbers", () => {
  it("says on the Agreement and the মনোনয়নপত্র that each Nominee's number is held, and the Receiver consents to theirs", () => {
    for (const content of [
      STANDARD_TEMPLATES.investment_agreement,
      STANDARD_TEMPLATES.nomination,
    ]) {
      expect(said(content)).toContain(NOMINEE_HOLDS);
      expect(said(content)).toContain(RECEIVER_CONSENTS);
    }
  });

  it("says in the privacy notice that the Nominees' and the Receiver's numbers are kept", () => {
    expect(said(STANDARD_TEMPLATES.privacy_notice)).toContain(
      "shares and NID numbers — a minor's birth registration number; and a minor Nominee's Receiver's name, relationship, phone and NID number"
    );
  });

  it("passes the checks a wording the Owner publishes passes", () => {
    expect(
      templateProblems(
        "investment_agreement",
        STANDARD_TEMPLATES.investment_agreement
      )
    ).toEqual([]);
    expect(
      templateProblems("nomination", STANDARD_TEMPLATES.nomination)
    ).toEqual([]);
    expect(
      templateProblems("privacy_notice", STANDARD_TEMPLATES.privacy_notice)
    ).toEqual([]);
  });

  it("keeps the standard before it to the letter, so a farm on it is caught up", () => {
    for (const before of [
      STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
      NOMINATION_BEFORE_NOMINEE_NUMBERS,
      PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
    ]) {
      expect(said(before)).not.toContain("NID number — a minor");
      expect(said(before)).not.toContain(RECEIVER_CONSENTS);
    }
    expect(said(STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS)).toContain(
      "holds their name, relationship, date of birth and phone"
    );
  });

  it("changes nothing else in them", () => {
    expect(
      apartFromTheNomineeLines(STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS)
    ).toEqual(
      apartFromTheNomineeLines(STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS)
    );
    expect(apartFromTheNomineeLines(STANDARD_TEMPLATES.nomination)).toEqual(
      apartFromTheNomineeLines(NOMINATION_BEFORE_NOMINEE_NUMBERS)
    );
    expect(said(STANDARD_TEMPLATES.privacy_notice).length).toBeGreaterThan(
      said(PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS).length
    );
    expect(STANDARD_TEMPLATES.privacy_notice.sections.length).toBe(
      PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS.sections.length
    );
  });
});
