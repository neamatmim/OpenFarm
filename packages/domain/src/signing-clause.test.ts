import { describe, expect, it } from "vitest";

import { carriesSigningClause, wordingFor } from "./paper-template";
import {
  PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE,
  STANDARD_TEMPLATES,
} from "./standard-templates";

// The Portal Consent's signing clause (ADR 0022): a code the farm sends, entered by the Investor in the portal, is their
// signature on the paper they agree to there. A consent signed on a Version carrying it lets them agree in the app.

const said = (content: unknown) => JSON.stringify(content);

describe("the Portal Consent's signing clause", () => {
  it("is carried by today's standard consent, and not by the one before it", () => {
    expect(carriesSigningClause(STANDARD_TEMPLATES.portal_consent)).toBe(true);
    expect(carriesSigningClause(PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE)).toBe(
      false
    );
  });

  it("is said to a person, and for an Organization by its Signatory", () => {
    const person = wordingFor(STANDARD_TEMPLATES.portal_consent, {
      paidByTheMonth: false,
    });
    const signatory = wordingFor(STANDARD_TEMPLATES.portal_consent, {
      paidByTheMonth: false,
      organization: true,
    });

    expect(said(person)).toContain("is my signature on that paper");
    expect(said(person)).not.toContain("for the organization");
    expect(said(signatory)).toContain("is my signature for it on that paper");
  });

  it("no longer says nothing is signed through the portal, nor counts what follows", () => {
    const consent = STANDARD_TEMPLATES.portal_consent;

    expect(said(consent)).not.toContain("Nothing is signed or paid");
    expect(said(consent)).toContain("Nothing is paid through the portal");
    expect(consent.preamble.en).toContain("I consent to the following");
    expect(consent.preamble.bn).not.toContain("তিনটিতে");
  });

  it("is still carried when the Owner rewords it, for it is marked rather than matched", () => {
    const reworded = {
      ...STANDARD_TEMPLATES.portal_consent,
      sections: STANDARD_TEMPLATES.portal_consent.sections.map((section) =>
        section.kind === "clauses"
          ? {
              ...section,
              clauses: section.clauses.map((clause) =>
                clause.signingClause
                  ? {
                      ...clause,
                      bn: "নিজের কথায়",
                      en: "In the Owner's own words",
                    }
                  : clause
              ),
            }
          : section
      ),
    };

    expect(carriesSigningClause(reworded)).toBe(true);
  });
});
