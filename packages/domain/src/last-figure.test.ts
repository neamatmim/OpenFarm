import { describe, expect, it } from "vitest";

import { farFromLast, readsAgainstLast } from "./last-figure";

describe("a figure read against the animal's last", () => {
  it("asks about a slip of the thumb that a fixed range lets through", () => {
    // 55 for 5.5 is inside 0–40 liters' worth of nothing, and far from her six.
    expect(farFromLast("milk_record", 6, 55)).toBe(true);
    expect(farFromLast("weigh_in", 320, 32)).toBe(true);
  });

  it("takes an ordinary change without asking", () => {
    expect(farFromLast("milk_record", 6, 7.5)).toBe(false);
    // A cow at two liters may give five: the floor, not the share, says how far.
    expect(farFromLast("milk_record", 2, 5)).toBe(false);
    // A bull weighed a month on has put on twenty-odd kilos.
    expect(farFromLast("weigh_in", 320, 342)).toBe(false);
    expect(farFromLast("weigh_in", 320, 365)).toBe(true);
  });

  it("is asked only of milk and weighings", () => {
    expect(readsAgainstLast("milk_record")).toBe(true);
    expect(readsAgainstLast("weigh_in")).toBe(true);
    expect(readsAgainstLast("observation")).toBe(false);
    expect(readsAgainstLast()).toBe(false);
  });
});
