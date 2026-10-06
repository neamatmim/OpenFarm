import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { blockerSaid } from "./sop-blockers";

// What stops a procedure being published, said where it is and in the reader's words — never the path a developer
// reads, on a Bangla page.

const inBangla = (key: MessageKey, params?: MessageParams) =>
  translate("bn", key, params);

describe("what stops a procedure being published", () => {
  it("says which Step is missing its Bangla, in Bangla", () => {
    const said = blockerSaid("steps[0].text.bn: Bangla is required", inBangla);
    expect(said).not.toContain("steps[0]");
    expect(said).not.toMatch(/[A-Za-z]/u);
  });

  it("says a procedure with no steps, and anything else where it is, without a word of English", () => {
    for (const blocker of [
      "steps: an SOP needs at least one step",
      "steps[2].evidence[0]: the range runs backwards",
      "triggers[0]: a schedule needs a time",
      "assignedRole: only the Vet records a pregnancy check",
    ]) {
      expect(blockerSaid(blocker, inBangla)).not.toMatch(/[A-Za-z]/u);
    }
  });
});
