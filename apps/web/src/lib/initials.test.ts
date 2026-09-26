import { describe, expect, it } from "vitest";

import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes the first letters of a person's first two names", () => {
    expect(initialsOf("আবুল হাশেম মিয়া")).toBe("আহ");
    expect(initialsOf("Abul Hashem Mia")).toBe("AH");
  });

  it("passes over a title before the name, as the people on the farm's books are written", () => {
    expect(initialsOf("মোঃ আব্দুল করিম")).toBe("আক");
    expect(initialsOf("হাজী আব্দুল মালেক")).toBe("আম");
    expect(initialsOf("ডাঃ নুরুল আমিন")).toBe("নআ");
    expect(initialsOf("ইঞ্জিনিয়ার রফিকুল ইসলাম")).toBe("রই");
    expect(initialsOf("Md. Abdul Karim")).toBe("AK");
    expect(initialsOf("Dr Nurul Amin")).toBe("NA");
  });

  it("keeps the title when it is all there is", () => {
    expect(initialsOf("হাজী")).toBe("হ");
  });

  it("says nothing for no name", () => {
    expect(initialsOf("  ")).toBe("");
  });
});
