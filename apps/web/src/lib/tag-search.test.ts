import { describe, expect, it } from "vitest";

import { tagMatches, tagNumbered, tagSought } from "./tag-search";

describe("a Tag Number typed on a Bangla keyboard", () => {
  it("is read in the digits and letters the tags are written in", () => {
    expect(tagSought("১২")).toBe("12");
    expect(tagSought(" ডি-০০১২ ")).toBe("D-0012");
    expect(tagSought("এফ-০০০৩")).toBe("F-0003");
    expect(tagSought("d-12")).toBe("D-12");
  });

  it("finds the cow whose tag it is, and not the ones whose tag it is not", () => {
    expect(tagMatches("D-0012", tagSought("১২"))).toBe(true);
    expect(tagMatches("D-0012", tagSought("ডি-০০১২"))).toBe(true);
    expect(tagMatches("F-0012", tagSought("ডি-০০১২"))).toBe(false);
    expect(tagMatches("D-0034", tagSought("১২"))).toBe(false);
  });

  it("opens the one animal whose number it is, and none where two sides share it", () => {
    expect(tagNumbered(["D-0012", "D-0120", "D-1234"], tagSought("১২"))).toBe(
      "D-0012"
    );
    expect(tagNumbered(["D-0012", "F-0012"], tagSought("12"))).toBeNull();
    expect(tagNumbered(["D-0012"], tagSought("D-12"))).toBeNull();
    // Only digits are a number here: "1e2" is not a way of writing a hundred on a cow's ear.
    expect(tagNumbered(["D-0100"], tagSought("1e2"))).toBeNull();
  });
});
