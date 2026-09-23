import { describe, expect, it } from "vitest";

import type { Venture } from "./ventures";
import { decisionIsDue, troubleWith } from "./ventures";

// An Open Venture short of its Floor has a day by which it must start buying or be called off. The Owner hears of it
// a week ahead, while there is still time to bring in the rest, and not before — nor once the Floor is met.

const NOW = new Date("2026-09-23T06:00:00.000Z");

const open = (fields: Partial<Venture>): Venture =>
  ({
    state: "open",
    floorBdt: 700_000,
    capitalInBdt: 100_000,
    decideBy: "2026-09-30",
    ...fields,
  }) as Venture;

describe("a decision coming due", () => {
  it("is said a week ahead of the day, with the Floor unmet", () => {
    expect(decisionIsDue(open({ decideBy: "2026-09-30" }), NOW)).toBe(true);
  });

  it("is said once the day has gone by", () => {
    expect(decisionIsDue(open({ decideBy: "2026-09-01" }), NOW)).toBe(true);
  });

  it("is not said while the day is more than a week off", () => {
    expect(decisionIsDue(open({ decideBy: "2026-10-01" }), NOW)).toBe(false);
  });

  it("is not said once the Floor is met", () => {
    expect(decisionIsDue(open({ capitalInBdt: 700_000 }), NOW)).toBe(false);
  });

  it("is not said of a run that has started buying", () => {
    expect(decisionIsDue(open({ state: "buying" }), NOW)).toBe(false);
  });

  it("is one of the troubles that wants the Owner, with how short it is", () => {
    // `troubleWith` reads today's clock, so the day is put a year back to be past on any clock that runs this.
    const due = open({ decideBy: "2025-09-30", bank: undefined });
    expect(troubleWith(due)).toContainEqual({
      word: "decision_due",
      decideBy: "2025-09-30",
      shortBdt: 600_000,
    });
  });
});
