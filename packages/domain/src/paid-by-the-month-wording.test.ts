import { describe, expect, it } from "vitest";

import { templateProblems, wordingFor } from "./paper-template";
import {
  STANDARD_AGREEMENT_BEFORE_MONTHLY,
  STANDARD_TEMPLATES,
} from "./standard-templates";

// The clauses the advisers approved on 2026-10-02 for capital paid by the month, in the standard Investment Agreement:
// printed only on such a Venture's paper, in the places they approved, and never on anybody else's.

const agreement = STANDARD_TEMPLATES.investment_agreement;
const terms = (paidByTheMonth: boolean) => {
  const printed = wordingFor(agreement, { paidByTheMonth });
  const part = printed.sections.find(
    (section) => section.kind === "clauses" && section.heading.en === "Terms"
  );
  return part?.kind === "clauses" ? part.clauses.map((one) => one.en) : [];
};

describe("the standard Investment Agreement", () => {
  it("prints exactly the words it printed before on a Venture paid before buying", () => {
    expect(wordingFor(agreement, { paidByTheMonth: false })).toEqual(
      STANDARD_AGREEMENT_BEFORE_MONTHLY
    );
  });

  it("prints the two parts after the profit and loss clauses and before the sale window, on a Venture paid by the month", () => {
    const said = terms(true);
    // The last of the loss clauses: a death, then a loss or theft the Farm makes good.
    const loss = said.findIndex((one) =>
      one.startsWith("If an animal is lost or stolen")
    );
    const window = said.findIndex((one) =>
      one.startsWith("Target sale window")
    );

    expect(said[loss + 1]).toMatch(
      /^The Investor pays their capital in two parts/u
    );
    expect(said[window - 1]).toMatch(/^If an Investor stops paying/u);
    expect(window - loss - 1).toBe(7);
  });

  it("prints what happens on a death with sums to come straight after the heirs clause", () => {
    const said = terms(true);
    const heirs = said.findIndex((one) =>
      one.startsWith("If the Investor dies, their capital")
    );

    expect(said[heirs + 1]).toMatch(
      /^If the Investor dies with Monthly Sums still to come/u
    );
  });

  it("asks only for facts an Investment Agreement may carry", () => {
    expect(templateProblems("investment_agreement", agreement)).toEqual([]);
  });
});
