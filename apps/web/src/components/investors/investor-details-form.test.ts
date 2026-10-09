import { DETAILS_FORM_PARTS, investorDetailsForm } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import {
  NOBODY_YET,
  ORGANIZATION_FIELDS,
  PERSON_FIELDS,
} from "./investor-fields";
import { EMPTY_DRAFT } from "./nominee-draft";

// The Investor Details Form is the record sheet on paper: a box added to the sheet without a line on the form, or a
// line on the form the sheet never asks, is a sheet the Owner cannot fill in from the paper.

const FORM = investorDetailsForm({
  farm: {
    name: "খামার",
    address: null,
    phone: null,
    registrationNumber: null,
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  produced: { bn: "", en: "" },
});

/** The lines of one part, by the boxes they are typed into. */
const linesOf = (heading: string): string[] => {
  const part = FORM.sections.find(
    (section) => section.kind === "blanks" && section.heading.en === heading
  );
  if (!part || part.kind !== "blanks") {
    throw new Error(`no part headed ${heading}`);
  }
  return part.blanks.map((blank) => blank.name);
};

/** A relation written in words is the same line as the relation chosen: one box on paper, two on the screen. */
const SAME_LINE = new Set(["relationInWords", "receiverRelationInWords"]);

describe("the Investor Details Form held to the record sheet", () => {
  it("asks a person what the sheet asks, in its order, their money last", () => {
    expect([
      ...linesOf(DETAILS_FORM_PARTS.person.en),
      ...linesOf(DETAILS_FORM_PARTS.money.en),
    ]).toEqual([...PERSON_FIELDS]);
  });

  it("asks an organization and its signatory what the sheet asks, in its order", () => {
    expect([
      ...linesOf(DETAILS_FORM_PARTS.organization.en),
      ...linesOf(DETAILS_FORM_PARTS.signatory.en),
      ...linesOf(DETAILS_FORM_PARTS.money.en),
    ]).toEqual([...ORGANIZATION_FIELDS]);
  });

  it("leaves no box of the sheet off the paper, which kind is one of them", () => {
    expect(
      new Set([
        ...linesOf(DETAILS_FORM_PARTS.who.en),
        ...PERSON_FIELDS,
        ...ORGANIZATION_FIELDS,
      ])
    ).toEqual(new Set(Object.keys(NOBODY_YET)));
  });

  it("asks of each Nominee what the Nominee form asks, the Receiver's lines among them", () => {
    expect(linesOf(`${DETAILS_FORM_PARTS.nominee.en} 1`)).toEqual(
      Object.keys(EMPTY_DRAFT).filter((key) => !SAME_LINE.has(key))
    );
  });
});
