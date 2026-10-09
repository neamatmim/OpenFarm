import { describe, expect, it } from "vitest";

import { changeBetween } from "./month-change";

describe("the change from the month before", () => {
  it("is a sum's in whole taka, each month rounded as it is said", () => {
    expect(changeBetween("sum", 1000.4, 500.6)).toBe(499);
    expect(changeBetween("sum", 0, 89_300)).toBe(-89_300);
  });

  it("is a margin's in points, to the tenth", () => {
    expect(changeBetween("percent", 26.5, 24.4)).toBe(2.1);
    expect(changeBetween("percent", -23.4, -81.9)).toBe(58.5);
  });

  it("is nothing where either month has nothing", () => {
    expect(changeBetween("sum", null, 500)).toBeNull();
    expect(changeBetween("percent", 26.5, null)).toBeNull();
  });
});
