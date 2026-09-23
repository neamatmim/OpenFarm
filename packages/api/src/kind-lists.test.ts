import { ALERT_KINDS as STORED_KINDS } from "@OpenFarm/db/schema/alert-kinds";
import { REVIEW_REASONS as STORED_REASONS } from "@OpenFarm/db/schema/review";
import { ALERT_KINDS, REVIEW_REASONS } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

// The db package depends on nothing, so the lists its columns are typed from are written twice: once there, once in
// the domain the screens read. Each copy is right on its own, and only this says they are the same list — a reason
// the store takes and the screens have never heard of is a row that prints its own code.

describe("the lists the store keeps and the lists the screens read", () => {
  it("name the same kinds of Notice", () => {
    expect([...ALERT_KINDS].toSorted()).toEqual([...STORED_KINDS].toSorted());
  });

  it("name the same reasons for putting something in front of the Manager", () => {
    expect([...REVIEW_REASONS].toSorted()).toEqual(
      [...STORED_REASONS].toSorted()
    );
  });
});
