import { standardPlaybook } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { putOffKindOf } from "./put-off-store";

// Which work put off is owed again, read from the work and never from a skip's words.
const playbook = standardPlaybook({ fmdVaccine: "fmd" });

describe("putOffKindOf", () => {
  it("is a Release, from its release Step, whatever raised it", () => {
    expect(
      putOffKindOf(
        "state:a:quarantine:2030-01-01T00:00:00.000Z:+30",
        playbook.quarantineRelease
      )
    ).toBe("release");
  });

  it("is an arrival dose only where his arrival raised the dose", () => {
    expect(putOffKindOf("arrival:a:+10", playbook.arrivalFmd)).toBe(
      "arrival_dose"
    );
    // The same dose raised by anything else — a Prescription, a Campaign — is not owed again by this rule.
    expect(putOffKindOf("prescription:p:1", playbook.arrivalFmd)).toBeNull();
    expect(putOffKindOf("arrival:a:+10", playbook.arrivalCheck)).toBeNull();
  });
});
