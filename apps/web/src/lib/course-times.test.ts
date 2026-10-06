import { describe, expect, it } from "vitest";

import { courseDaysOf, courseTimesOf } from "./course-times";

// The times and days of a course as the Vet types them, on a Bangla keyboard or not: what the farm will take, or
// nothing — never something the farm will always refuse.

describe("the times of a course, as typed", () => {
  it("takes Bangla digits and a short hour", () => {
    expect(courseTimesOf("০৮:০০, ২০:০০")).toEqual(["08:00", "20:00"]);
    expect(courseTimesOf("8:00, 20:30")).toEqual(["08:00", "20:30"]);
  });

  it("is nothing where a time is not one", () => {
    expect(courseTimesOf("08:00, 25:00")).toBeNull();
    expect(courseTimesOf("সকালে")).toBeNull();
    expect(courseTimesOf("")).toBeNull();
  });
});

describe("the days of a course, as typed", () => {
  it("is nothing for a box left blank, not nought", () => {
    expect(courseDaysOf("")).toBeNull();
    expect(courseDaysOf("০")).toBeNull();
    expect(courseDaysOf("৫")).toBe(5);
    expect(courseDaysOf("2.5")).toBeNull();
  });
});
