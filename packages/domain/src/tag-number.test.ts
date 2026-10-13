import { describe, expect, it } from "vitest";

import { tagNumberAsWritten } from "./tag-number";

describe("a Tag Number as somebody typed it", () => {
  it("is the tag the farm wrote, however a Bangla or an English keyboard typed it", () => {
    for (const typed of [
      "D-0012",
      "d-0012",
      "d-12",
      "D12",
      "D 12",
      "ডি-১২",
      "ডি১২",
      "ডি ১২",
      " ডি-০০১২ ",
    ]) {
      expect(tagNumberAsWritten(typed)).toBe("D-0012");
    }
    expect(tagNumberAsWritten("এফ-৩")).toBe("F-0003");
  });

  it("keeps a number past four digits whole, and the side it was typed with", () => {
    expect(tagNumberAsWritten("f-12345")).toBe("F-12345");
  });

  it("leaves what is not a Tag Number as it was typed, in capitals and English digits, for a search to narrow by", () => {
    expect(tagNumberAsWritten("১২")).toBe("12");
    expect(tagNumberAsWritten("bd-1234")).toBe("BD-1234");
  });
});
