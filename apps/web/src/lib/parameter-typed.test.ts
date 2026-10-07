import { describe, expect, it } from "vitest";

import {
  digestTimesOf,
  parameterFigure,
  parameterProblem,
} from "./parameter-typed";

// The farm's settings as a Bangla desk types them: Bangla digits read as digits, an hour without its nought taken, and
// a figure outside what the farm takes said before saving.

describe("a setting's figure, typed", () => {
  it("is read in Bangla digits, and refused when not whole or out of range", () => {
    expect(parameterProblem("৩০", { min: 1, max: 60 })).toBeNull();
    expect(parameterFigure("৩০")).toBe(30);
    expect(parameterProblem("1.5", { min: 1, max: 60 })).toBe(
      "notAWholeFigure"
    );
    expect(parameterProblem("", { min: 1, max: 60 })).toBe("notAWholeFigure");
    expect(parameterProblem("৬১", { min: 1, max: 60 })).toBe("outOfRange");
    expect(parameterProblem("0", { min: 1 })).toBe("outOfRange");
  });
});

describe("the digest's times, typed", () => {
  it("are read in Bangla digits and with an hour of one figure", () => {
    expect(digestTimesOf("০৭:০০, 7:30 , 18:00")).toEqual([
      "07:00",
      "07:30",
      "18:00",
    ]);
    expect(digestTimesOf("সন্ধ্যা")).toEqual(["সন্ধ্যা"]);
  });
});
