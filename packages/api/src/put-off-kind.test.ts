import { standardPlaybook } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { putOffKindOf } from "./put-off-store";

// Which work put off is owed again, read from the work and never from a skip's words.
const playbook = standardPlaybook({ fmdVaccine: "fmd", tickSpray: "spray" });

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
    // The same dose raised by anything else — a Prescription — is not owed again by this rule.
    expect(putOffKindOf("prescription:p:1", playbook.arrivalFmd)).toBeNull();
    expect(putOffKindOf("arrival:a:+10", playbook.arrivalCheck)).toBeNull();
  });

  it("is a Campaign dose only for her dose of a Pen's Campaign, put off", () => {
    expect(putOffKindOf("campaign:w:a", playbook.fmdVaccination)).toBe(
      "campaign_dose"
    );
    // The Pen's own work, raised by hand, is not hers.
    expect(
      putOffKindOf("byHand:p:2087-01-15", playbook.fmdVaccination)
    ).toBeNull();
  });

  it("is nothing for a tick spray, whose next week is its later", () => {
    // Walked over a Pen and dosing each animal as a Campaign does, but on a Schedule: a bull left out — unwell, or
    // within a month of his sale — is sprayed when it comes round, never raised again into his withdrawal.
    expect(putOffKindOf("campaign:w:a", playbook.tickSpray)).toBeNull();
  });
});
