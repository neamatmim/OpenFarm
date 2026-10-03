import { describe, expect, it } from "vitest";

import { paperOnFile } from "./agreed-in-app";

describe("paper on file", () => {
  it("is the farm's answer, whatever the photograph says", () => {
    expect(paperOnFile({ paperOnFile: true, hasPaper: false })).toBe(true);
    expect(paperOnFile({ paperOnFile: false, hasPaper: true })).toBe(false);
  });

  it("reads the photograph in an answer cached before the farm said", () => {
    expect(paperOnFile({ hasPaper: true })).toBe(true);
    expect(paperOnFile({ hasPaper: false })).toBe(false);
  });
});
