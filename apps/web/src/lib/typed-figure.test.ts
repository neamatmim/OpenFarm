import { describe, expect, it } from "vitest";

import { aFigure, figureOf } from "./typed-figure";

describe("a typed figure", () => {
  it("reads Bangla digits as the number they are, and a blank as nothing", () => {
    expect(figureOf("৪৮০")).toBe(480);
    expect(figureOf("0.9")).toBe(0.9);
    expect(figureOf("")).toBeNull();
  });

  it("is one to use only when it is a real number above nothing, or not below it where nothing counts", () => {
    expect(aFigure(480)).toBe(true);
    expect(aFigure(0)).toBe(false);
    expect(aFigure(0, true)).toBe(true);
    expect(aFigure(-1, true)).toBe(false);
    expect(aFigure(Number.NaN)).toBe(false);
    expect(aFigure(null)).toBe(false);
  });
});
