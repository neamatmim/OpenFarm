import { describe, expect, it } from "vitest";

import { formatDate, formatDigits, formatNumber } from "./format";
import { resolveLanguage } from "./languages";
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

  it("Bangla covers every English key with no strays", () => {
    expect(findTranslationGaps("bn")).toEqual({ missing: [], stray: [] });
  });
});
