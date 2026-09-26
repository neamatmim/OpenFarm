import { STANDARD_TEMPLATES, TEMPLATE_KINDS } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { fromDraft, moved, newSection, toDraft } from "./template-draft";

describe("the wording as the editor holds it", () => {
  it("publishes exactly what it was given, every kind of it", () => {
    for (const kind of TEMPLATE_KINDS) {
      expect(fromDraft(toDraft(STANDARD_TEMPLATES[kind]))).toEqual(
        STANDARD_TEMPLATES[kind]
      );
    }
  });

  it("keys every part and clause apart, so moving one keeps its box", () => {
    const draft = toDraft(STANDARD_TEMPLATES.investment_agreement);
    const terms = draft.sections.find((one) => one.kind === "clauses");
    if (terms?.kind !== "clauses") {
      throw new Error("expected the terms");
    }
    const keys = terms.clauses.map((one) => one.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(moved(keys, 0, 1).slice(0, 2)).toEqual([keys[1], keys[0]]);
    expect(moved(keys, 0, -1)).toEqual(keys);
  });

  it("keys the lines under the nominee, and publishes a parties part with none as it was worded before them", () => {
    const draft = toDraft(STANDARD_TEMPLATES.investment_agreement);
    const [parties] = draft.sections;
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties first");
    }
    const fresh = fromDraft({ ...draft, sections: [newSection("parties")] });

    expect(parties.nomineeLines.map((one) => one.key)).toHaveLength(1);
    expect(fresh.sections[0]).not.toHaveProperty("nomineeLines");
  });

  it("publishes a Receiver's or no-Nominee line left empty as no line at all, and one written as it was written", () => {
    const draft = toDraft(STANDARD_TEMPLATES.nomination);
    const [parties, ...rest] = draft.sections;
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties first");
    }
    const cleared = fromDraft({
      ...draft,
      sections: [
        {
          ...parties,
          receiverLine: { bn: " ", en: "" },
          noNomineeLine: { bn: "", en: "" },
        },
        ...rest,
      ],
    });

    expect(cleared.sections[0]).not.toHaveProperty("receiverLine");
    expect(cleared.sections[0]).not.toHaveProperty("noNomineeLine");
    expect(fromDraft(draft).sections[0]).toHaveProperty(
      "receiverLine",
      STANDARD_TEMPLATES.nomination.sections[0]?.kind === "parties"
        ? STANDARD_TEMPLATES.nomination.sections[0].receiverLine
        : undefined
    );
  });
});
