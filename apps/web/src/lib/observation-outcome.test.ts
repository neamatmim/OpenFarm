import { describe, expect, it } from "vitest";

import { outcomeOf, stillToSeeTo } from "./observation-outcome";

// "Which of what the round saw is still open?" — the Observations whose work is still owed, and nothing else: not one
// done, not one that raised nothing, and not one from a list a phone kept from before Observations said what became of
// them.

describe("which Observations are still to see to", () => {
  it("keeps one whose work is still owed", () => {
    expect(stillToSeeTo({ outcome: { state: "open" } })).toBe(true);
  });

  it("leaves out one done, and one that raised nothing", () => {
    expect(stillToSeeTo({ outcome: { state: "done" } })).toBe(false);
    expect(stillToSeeTo({ outcome: null })).toBe(false);
  });

  it("reads an Observation kept from before as having no outcome to say", () => {
    expect(outcomeOf({})).toBeNull();
    expect(stillToSeeTo({})).toBe(false);
  });
});
