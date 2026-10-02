import { describe, expect, it } from "vitest";

import { weighedTooLongAgo } from "./priced-weighing";

// Weighed at half past one in the afternoon, farm time, on 14 February.
const weighed = new Date("2047-02-14T07:30:00.000Z");

describe("weighedTooLongAgo", () => {
  it("says the day and how old a weighing past the line is", () => {
    expect(weighedTooLongAgo(weighed, "2047-03-06", 14)).toEqual({
      weighedOn: "2047-02-14",
      days: 20,
    });
  });

  it("says nothing on the line or within it", () => {
    expect(weighedTooLongAgo(weighed, "2047-02-28", 14)).toBeNull();
    expect(weighedTooLongAgo(weighed, "2047-02-24", 14)).toBeNull();
  });
});
