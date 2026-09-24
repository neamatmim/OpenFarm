import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDigits,
  formatNumber,
  numberAsTyped,
} from "./format";
import { resolveLanguage } from "./languages";
import { en } from "./messages/en";
import { findTranslationGaps, translate } from "./translate";

describe("language resolution", () => {
  it("defaults to Bangla when a person has no setting", () => {
    expect(resolveLanguage(null)).toBe("bn");
    expect(resolveLanguage({ language: null })).toBe("bn");
    expect(resolveLanguage({})).toBe("bn");
  });

  it("honours a setting we speak and ignores one we don't", () => {
    expect(resolveLanguage({ language: "en" })).toBe("en");
    expect(resolveLanguage({ language: "fr" })).toBe("bn");
  });
});

describe("numbers", () => {
  it("shows Bangla numerals with Bangla grouping in Bangla", () => {
    expect(formatNumber(1_234_567.5, "bn")).toBe("১২,৩৪,৫৬৭.৫");
  });

  it("shows digits with Western grouping in English", () => {
    expect(formatNumber(1_234_567.5, "en")).toBe("1,234,567.5");
  });

  it("renders plain digits without grouping for identifiers", () => {
    expect(formatDigits(2026, "bn")).toBe("২০২৬");
    expect(formatDigits(2026, "en")).toBe("2026");
  });
});

describe("dates", () => {
  const eleventh = new Date("2026-09-11T05:00:00.000Z");

  it("shows Gregorian dates with Bangla month names in Bangla", () => {
    expect(formatDate(eleventh, "bn")).toBe("১১ সেপ্টেম্বর, ২০২৬");
  });

  it("shows the same date in English", () => {
    expect(formatDate(eleventh, "en")).toBe("11 September 2026");
  });

  it("shows month and year", () => {
    expect(formatDate(eleventh, "bn", "monthYear")).toBe("সেপ্টেম্বর ২০২৬");
  });
});

describe("messages", () => {
  it("fills placeholders, formatting numbers for the language", () => {
    expect(translate("bn", "auth.passwordTooShort", { min: 8 })).toBe(
      "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে"
    );
    expect(translate("en", "dashboard.welcome", { name: "Rahim" })).toBe(
      "Welcome, Rahim"
    );
  });

  it("says one of a thing in the singular and any other number in the plural, in English", () => {
    expect(translate("en", "herd.penCount", { count: 1 })).toBe("1 pen");
    expect(translate("en", "herd.penCount", { count: 0 })).toBe("0 pens");
    expect(translate("en", "herd.penCount", { count: 1234 })).toBe(
      "1,234 pens"
    );
    // A screen that formatted the figure itself still gets the right word.
    expect(translate("en", "herd.penCount", { count: "1" })).toBe("1 pen");
    expect(translate("bn", "herd.penCount", { count: 1 })).toBe("১টি পেন");
  });

  it("no English message puts a bare count before a word that changes with it", () => {
    // "{name} is" is a name, not a count: these are the words that follow one.
    const notACount = new Set([
      "is",
      "was",
      "has",
      "needs",
      "says",
      "this",
      "ends",
    ]);
    const countThenPlural =
      /\{(?<name>\w+)\} (?:more |new |expired |common |[A-Z]\w+ )?(?<word>[A-Za-z]+s)\b/gu;
    const bare = Object.entries(en).flatMap(([key, message]) =>
      [...message.matchAll(countThenPlural)]
        .filter((match) => !notACount.has(match.groups?.word ?? ""))
        .map((match) => `${key}: ${match[0]}`)
    );

    expect(bare).toEqual([]);
  });

  it("Bangla covers every English key with no strays", () => {
    expect(findTranslationGaps("bn")).toEqual({ missing: [], stray: [] });
  });
});

describe("a number as it is typed", () => {
  it("takes Bangla digits from a Bangla keyboard as the figure they are", () => {
    expect(numberAsTyped("১২.৫")).toBe("12.5");
    expect(numberAsTyped("১২০")).toBe("120");
  });

  it("keeps English digits, and a mix of both", () => {
    expect(numberAsTyped("12.5")).toBe("12.5");
    expect(numberAsTyped("১2.৫")).toBe("12.5");
  });

  it("drops what is not part of a number: grouping, units, letters, a second point", () => {
    expect(numberAsTyped("১,২০০ kg")).toBe("1200");
    expect(numberAsTyped("1.2.3")).toBe("1.23");
  });

  it("keeps a minus only at the front", () => {
    expect(numberAsTyped("-3")).toBe("-3");
    expect(numberAsTyped("3-")).toBe("3");
  });
});
