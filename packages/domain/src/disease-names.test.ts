import { describe, expect, it } from "vitest";

import { namesTheDisease } from "./disease-names";

const fmd = {
  nameBn: "ক্ষুরা রোগ",
  nameEn: "Foot-and-mouth disease",
  otherNames: ["খুরা রোগ", "FMD"],
};

describe("naming a disease on the list", () => {
  it("knows it by its name, its English and its other names, whatever the capitals", () => {
    expect(namesTheDisease(fmd, { bn: "ক্ষুরা রোগ" })).toBe(true);
    expect(
      namesTheDisease(fmd, { bn: "x", en: "foot-and-mouth disease" })
    ).toBe(true);
    expect(namesTheDisease(fmd, { bn: "fmd" })).toBe(true);
    expect(namesTheDisease(fmd, { bn: " খুরা রোগ " })).toBe(true);
  });

  it("reads spaces and dashes as one spelling", () => {
    expect(namesTheDisease(fmd, { bn: "Foot and  mouth disease" })).toBe(true);
  });

  it("reads Bangla written in either Unicode form as the same word", () => {
    // ড় as one letter, and as ড with its dot beneath: two spellings a phone may send of the same word.
    const oneLetter = "\u09A4\u09DC\u0995\u09BE";
    const withTheDot = "\u09A4\u09A1\u09BC\u0995\u09BE";
    expect(oneLetter).not.toBe(withTheDot);
    expect(
      namesTheDisease(
        { nameBn: oneLetter, nameEn: null, otherNames: [] },
        { bn: withTheDot }
      )
    ).toBe(true);
  });

  it("does not take a disease for another", () => {
    expect(namesTheDisease(fmd, { bn: "ওলান প্রদাহ", en: "Mastitis" })).toBe(
      false
    );
  });
});
