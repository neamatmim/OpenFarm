import { describe, expect, it } from "vitest";

import { pickerMatches } from "./picker-match";

const people = [{ label: "ডিপু মিয়া" }, { label: "Dulal" }];
const herd = [{ label: "D-0012" }, { label: "F-0012" }, { label: "D-0034" }];

const found = (
  options: readonly { label: string; detail?: string }[],
  typed: string,
  ofTags: boolean
) =>
  options
    .filter((one) => pickerMatches(one, typed, ofTags))
    .map((one) => one.label);

describe("narrowing a picker by what is typed", () => {
  it("finds an animal by her tag typed on a Bangla keyboard, where the choices are Tag Numbers", () => {
    expect(found(herd, "ডি১২", true)).toEqual(["D-0012"]);
    expect(found(herd, "১২", true)).toEqual(["D-0012", "F-0012"]);
  });

  it("reads a person's or a feed's name as typed, never as a tag", () => {
    expect(found(people, "ডি", false)).toEqual(["ডিপু মিয়া"]);
    expect(found(people, "dul", false)).toEqual(["Dulal"]);
  });
});
