import { describe, expect, it } from "vitest";

import { REFERENCE_GROUPS, STANDARD_REFERENCES } from "./standard-references";

// The Owner opens these when a figure is questioned: a guide with no link, a link that is not the web's, or a line
// said in one language only would leave somebody on the farm with nothing to open.

describe("the standard references", () => {
  it("each has a link to open, and says what it is good for in both languages", () => {
    for (const one of STANDARD_REFERENCES) {
      expect({
        title: one.title,
        links:
          one.links.length > 0 &&
          one.links.every((link) => link.startsWith("https://")),
        said: one.goodFor.bn.trim() !== "" && one.goodFor.en.trim() !== "",
      }).toEqual({ title: one.title, links: true, said: true });
    }
  });

  it("names each guide once, and every group has one", () => {
    const titles = STANDARD_REFERENCES.map((one) => one.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const group of REFERENCE_GROUPS) {
      expect(STANDARD_REFERENCES.some((one) => one.group === group)).toBe(true);
    }
  });
});
