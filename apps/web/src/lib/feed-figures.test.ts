import { describe, expect, it } from "vitest";

import { bagSizeTakes, figureTakes, keptAmount } from "./feed-figures";

// What a feed box takes is what the farm takes: a figure the screen sends is never one refused in English.

describe("feed figures as typed", () => {
  it("keeps no less than a tenth of the unit", () => {
    expect(keptAmount(0.04)).toBeNull();
    expect(keptAmount(0.1)).toBe(0.1);
  });

  it("takes a bag above nothing and no more than a bag weighs, or none", () => {
    expect(bagSizeTakes("")).toBe(true);
    expect(bagSizeTakes("0")).toBe(false);
    expect(bagSizeTakes("250")).toBe(false);
    expect(bagSizeTakes("50")).toBe(true);
  });

  it("takes a low-stock level of a tenth at least, and a fodder price of nothing", () => {
    expect(figureTakes("level", "0")).toBe(false);
    expect(figureTakes("fodderPrice", "0")).toBe(true);
  });
});
