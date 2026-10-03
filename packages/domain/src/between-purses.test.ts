import { describe, expect, it } from "vitest";

import { whyNotBetweenPurses } from "./between-purses";

const BULL = {
  side: "fattening",
  source: "bought",
  state: "fattening",
} as const;

describe("moving her between purses", () => {
  it("takes a bought Fattening animal still being fattened, and weighed where that is known", () => {
    expect(whyNotBetweenPurses(BULL)).toBeNull();
    expect(whyNotBetweenPurses({ ...BULL, state: "quarantine" })).toBeNull();
    expect(whyNotBetweenPurses(BULL, { weighed: true })).toBeNull();
  });

  it("refuses, in the farm's order, a Dairy cow, one born here, one gone, one ready, one never weighed", () => {
    expect(whyNotBetweenPurses({ ...BULL, side: "dairy" })).toBe(
      "not_a_fattening_animal"
    );
    expect(whyNotBetweenPurses({ ...BULL, source: "born" })).toBe(
      "not_a_ventures_animal"
    );
    expect(whyNotBetweenPurses({ ...BULL, state: "sold" })).toBe("she_is_gone");
    expect(whyNotBetweenPurses({ ...BULL, state: "ready_for_sale" })).toBe(
      "she_is_ready_for_sale"
    );
    expect(whyNotBetweenPurses(BULL, { weighed: false })).toBe("never_weighed");
  });
});
