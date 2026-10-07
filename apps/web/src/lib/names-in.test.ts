import { describe, expect, it } from "vitest";

import { namesIn, saidIn } from "./names-in";

describe("a name in the reader's language", () => {
  it("reads English to an English reader, with the Bangla beside it", () => {
    expect(
      namesIn({ nameBn: "নেপিয়ার ঘাস", nameEn: "Napier grass" }, "en")
    ).toEqual({ shown: "Napier grass", other: "নেপিয়ার ঘাস" });
  });

  it("reads Bangla to a Bangla reader, with the English beside it", () => {
    expect(
      namesIn({ nameBn: "নেপিয়ার ঘাস", nameEn: "Napier grass" }, "bn")
    ).toEqual({ shown: "নেপিয়ার ঘাস", other: "Napier grass" });
  });

  it("falls back to the Bangla where the farm gave no English, and names nothing beside it", () => {
    expect(namesIn({ nameBn: "লবণ", nameEn: null }, "en")).toEqual({
      shown: "লবণ",
      other: null,
    });
    expect(namesIn({ nameBn: "লবণ" }, "bn")).toEqual({
      shown: "লবণ",
      other: null,
    });
  });

  it("says a Step's words in English where they were written, and in Bangla otherwise", () => {
    const step = { bn: "রেশন অনুযায়ী খাবার দিন", en: "Feed to the ration" };
    expect(saidIn(step, "en")).toBe("Feed to the ration");
    expect(saidIn(step, "bn")).toBe("রেশন অনুযায়ী খাবার দিন");
    expect(saidIn({ bn: "প্রসব পেন" }, "en")).toBe("প্রসব পেন");
  });
});
