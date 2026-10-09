import { describe, expect, it } from "vitest";

import {
  DETAILS_FORM_PARTS,
  investorDetailsForm,
} from "./investor-details-form";
import { MOST_NOMINEES } from "./nominees";
import { paperText } from "./paper-text";

// The blank form the Owner fills in with a new Investor and types in from afterwards: the record sheet's parts and
// boxes, in the same order, as lines to write on.

const FORM = investorDetailsForm({
  farm: {
    name: "সবুজ ছায়া ডেইরি",
    address: "সাভার, ঢাকা",
    phone: "+8801711000098",
    registrationNumber: "DLS/SAV/2026/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  produced: { bn: "৯ অক্টোবর, ২০২৬ · মালিক", en: "9 October 2026 · Owner" },
});

const parts = FORM.sections.filter((section) => section.kind === "blanks");

describe("the Investor Details Form", () => {
  it("is lines to write on, in the sheet's parts: who, a person, an organization and its signatory, the money, three Nominees, the farm", () => {
    expect(parts.map((part) => part.heading.en)).toEqual([
      DETAILS_FORM_PARTS.who.en,
      DETAILS_FORM_PARTS.person.en,
      DETAILS_FORM_PARTS.organization.en,
      DETAILS_FORM_PARTS.signatory.en,
      DETAILS_FORM_PARTS.money.en,
      ...Array.from(
        { length: MOST_NOMINEES },
        (_, at) => `${DETAILS_FORM_PARTS.nominee.en} ${at + 1}`
      ),
      DETAILS_FORM_PARTS.farm.en,
    ]);
    expect(FORM.sections.every((section) => section.kind === "blanks")).toBe(
      true
    );
  });

  it("names each line once within its part, for the box it is typed into", () => {
    for (const part of parts) {
      const names = part.blanks.map((blank) => blank.name);
      expect(new Set(names).size, part.heading.en).toBe(names.length);
    }
  });

  it("reads whole in either language, on the farm's letterhead", () => {
    const bn = paperText(FORM, "bn");
    expect(bn).toContain("সবুজ ছায়া ডেইরি");
    expect(bn).toContain("বিনিয়োগকারীর তথ্য ফর্ম");
    expect(bn).toContain("এনআইডি নম্বর: ____________");
    expect(bn).toContain("নমিনি ৩");
    expect(bn).toContain(
      "ব্যাংক হিসাব (হিসাবের নাম, হিসাব নম্বর, ব্যাংক ও শাখা): ____________"
    );
    const en = paperText(FORM, "en");
    expect(en).toContain("Investor details form");
    expect(en).toContain("Signatory's NID number: ____________");
    expect(en).toContain("Nominee 3");
    expect(en).toContain("Nothing is signed on this sheet.");
    expect(en).not.toContain("{");
  });
});
