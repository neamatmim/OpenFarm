import { describe, expect, it } from "vitest";

import type { Venture } from "./ventures";
import { decisionIsDue, pastWindUp, troubleWith } from "./ventures";

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

const running = (fields: Partial<Venture>): Venture =>
  ({
    state: "fattening",
    animalsStanding: 3,
    windUpEndsOn: "2025-01-01",
    ...fields,
  }) as Venture;

// A run that ends badly — its window over and its animals never sold, or all of them dead — never reaches Selling. It
// still has to be ended: what is left is bought back, and what the account holds is settled.
describe("a run past its Wind-up Period", () => {
  it("is past it while fattening, with animals still hers", () => {
    expect(pastWindUp(running({ state: "fattening" }))).toBe(true);
  });

  it("is past it while selling, as before", () => {
    expect(pastWindUp(running({ state: "selling" }))).toBe(true);
  });

  it("is not, with no animal left to buy back", () => {
    expect(pastWindUp(running({ animalsStanding: 0 }))).toBe(false);
  });

  it("is not, while the period has still to run out", () => {
    expect(pastWindUp(running({ windUpEndsOn: "9999-01-01" }))).toBe(false);
  });
});
