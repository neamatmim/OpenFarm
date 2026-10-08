import { describe, expect, it } from "vitest";

import type { Evidence } from "./sop";
import { outsideItsRange } from "./sop";

const LITERS: Evidence = { type: "number", required: true, min: 0, max: 40 };
const TICK: Evidence = { type: "tick", required: false };

describe("a figure outside its range", () => {
  it("is the first figure its Evidence calls odd", () => {
    expect(outsideItsRange([TICK, LITERS], [true, 95])).toBe("above 40");
    expect(outsideItsRange([LITERS], [-1])).toBe("below 0");
  });

  it("is nothing for a figure in range, a blank, or what is not a figure at all", () => {
    expect(outsideItsRange([LITERS], [12])).toBeNull();
    expect(outsideItsRange([LITERS], [""])).toBeNull();
    expect(outsideItsRange([TICK], [true])).toBeNull();
  });

  it("reads a figure typed as text as the figure it is", () => {
    expect(outsideItsRange([LITERS], { 0: "41" })).toBe("above 40");
  });
});
