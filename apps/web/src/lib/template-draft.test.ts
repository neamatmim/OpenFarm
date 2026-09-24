import { STANDARD_TEMPLATES, TEMPLATE_KINDS } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { fromDraft, moved, toDraft } from "./template-draft";

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
});
