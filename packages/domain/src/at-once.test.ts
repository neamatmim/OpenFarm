import { describe, expect, it } from "vitest";

import { MANY_AT_ONCE, tooManyAtOnce } from "./at-once";

// One act for a ticked Pen: a shed at Eid, never the whole herd by a slip. The screen stops at the same number the farm
// does, and says why, rather than sending a request the farm will refuse whole.

describe("how many may be done at once", () => {
  it("allows a shed's worth", () => {
    expect(tooManyAtOnce(MANY_AT_ONCE)).toBe(false);
  });

  it("stops at one more", () => {
    expect(tooManyAtOnce(MANY_AT_ONCE + 1)).toBe(true);
  });

  it("is two hundred", () => {
    expect(MANY_AT_ONCE).toBe(200);
  });
});
