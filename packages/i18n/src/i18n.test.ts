import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_FARM_LOCALE, setFarmLocale } from "./farm-locale";
import {
  formatDate,
  formatDigits,
  formatNumber,
  latinDigitsOf,
  numberAsTyped,
} from "./format";
import { resolveLanguage } from "./languages";
import { bn } from "./messages/bn";
import { en } from "./messages/en";
import type { MessageKey } from "./translate";
import { FARM_WORDS, findTranslationGaps, translate } from "./translate";

const farmWord = new Set<string>(FARM_WORDS);

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

  it("tells the time on the farm's 24-hour clock, with no English AM or PM in a Bangla sentence", () => {
    const afternoon = new Date("2026-09-24T08:59:00Z");

    expect(formatDate(afternoon, "bn", "time")).toBe("১৪:৫৯");
    expect(formatDate(afternoon, "en", "time")).toBe("14:59");
    expect(formatDate(afternoon, "bn", "dateTime")).not.toMatch(/AM|PM/u);
  });

  it("shows month and year", () => {
    expect(formatDate(eleventh, "bn", "monthYear")).toBe("সেপ্টেম্বর ২০২৬");
    expect(formatDate(eleventh, "bn", "monthShort")).toBe("সেপ্ট");
    expect(formatDate(eleventh, "en", "monthShort")).toBe("Sept");
  });
});

describe("messages", () => {
  it("fills placeholders, formatting numbers for the language", () => {
    expect(translate("bn", "auth.passwordTooShort", { min: 8 })).toBe(
      "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে"
    );
    expect(translate("en", "templates.published", { number: 2 })).toBe(
      "Published version 2"
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
      "owes",
      // "{taka} less" is a sum of money, not a count.
      "less",
    ]);
    const countThenPlural =
      /\{(?<name>\w+)\} (?:more |new |expired |common |[A-Z]\w+ )?(?<word>[A-Za-z]+s)\b/gu;
    const bare = Object.entries(en).flatMap(([key, message]) =>
      [...message.matchAll(countThenPlural)]
        .filter((match) => !notACount.has(match.groups?.word ?? ""))
        // "every {currencyOne} comes back" is the farm's currency, not a count.
        .filter((match) => !farmWord.has(match.groups?.name ?? ""))
        .map((match) => `${key}: ${match[0]}`)
    );

    expect(bare).toEqual([]);
  });

  it("Bangla covers every English key with no strays", () => {
    expect(findTranslationGaps("bn")).toEqual({ missing: [], stray: [] });
  });

  it("says in Bangla every fact its English does, by the same name", () => {
    // An English plural's branches are words, not facts: `{count, plural, one {# pen} other {# pens}}` asks for
    // `count` alone. A fact the Bangla leaves out is printed as `{name}` on the screen; one it invents never fills.
    const plural =
      /\{(?<name>\w+), plural, one \{[^{}]*\} other \{[^{}]*\}\}/gu;
    const fact = /\{(?<name>\w+)\}/gu;
    // The farm's own words fill every message unasked, so a language may say its currency where the other does not.
    const factsIn = (message: string) =>
      [
        ...new Set(
          [...message.replace(plural, "{$<name>}").matchAll(fact)]
            .map((found) => found.groups?.name ?? "")
            .filter((name) => !farmWord.has(name))
        ),
      ].toSorted();
    const differ = (Object.keys(en) as (keyof typeof en)[]).flatMap((key) => {
      const english = factsIn(en[key]);
      const bangla = factsIn(bn[key]);
      return english.join(",") === bangla.join(",")
        ? []
        : [`${key}: en ${english.join(",")} · bn ${bangla.join(",")}`];
    });

    expect(differ).toEqual([]);
  });
});

describe("a code as it is typed", () => {
  it("reads a Bangla keyboard's digits as the code's, and keeps its letters where they are", () => {
    expect(latinDigitsOf("৫XWQR-KR৭৭Z")).toBe("5XWQR-KR77Z");
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

describe("a key with no words", () => {
  // A key built by hand on a screen — `audit.calledOffBy.${why}` — is no type error when its words are missing: the
  // screen says what it can rather than going blank.
  it("says the English where Bangla has none, and the key itself where neither has", () => {
    const missing = "audit.calledOffBy.nothing_like_it" as MessageKey;
    expect(translate("bn", missing)).toBe("audit.calledOffBy.nothing_like_it");
    expect(translate("en", missing)).toBe("audit.calledOffBy.nothing_like_it");
  });
});

describe("the farm's currency", () => {
  afterEach(() => {
    setFarmLocale(DEFAULT_FARM_LOCALE);
  });

  it("says taka, with its sign, on a farm in Bangladesh", () => {
    expect(translate("en", "intake.taka", { taka: 1200 })).toBe("1,200 taka");
    expect(translate("bn", "intake.taka", { taka: 1200 })).toBe("১,২০০ টাকা");
    expect(translate("en", "params.taka")).toBe("৳");
    expect(translate("bn", "portal.promise.title")).toBe(
      "আপনার ভেঞ্চার, কাগজপত্র আর টাকার হিসাব — এক জায়গায়।"
    );
  });

  it("says the farm's own currency where it counts in another, with the endings its words take", () => {
    setFarmLocale({ ...DEFAULT_FARM_LOCALE, currency: "USD" });
    expect(translate("en", "intake.taka", { taka: 1200 })).toBe(
      "1,200 dollars"
    );
    expect(translate("en", "portal.promise.money")).toBe(
      "Every dollar you paid in, and every dollar paid to you."
    );
    expect(translate("en", "params.taka")).toBe("$");
    expect(translate("bn", "portal.promise.title")).toBe(
      "আপনার ভেঞ্চার, কাগজপত্র আর ডলারের হিসাব — এক জায়গায়।"
    );
  });

  it("refuses a currency it has no words for", () => {
    expect(() =>
      setFarmLocale({
        ...DEFAULT_FARM_LOCALE,
        currency: "XYZ" as typeof DEFAULT_FARM_LOCALE.currency,
      })
    ).toThrow("XYZ");
  });
});
