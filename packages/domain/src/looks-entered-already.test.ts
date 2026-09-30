import { describe, expect, it } from "vitest";

import { looksEnteredAlready } from "./money";

const earlier = [
  { id: "a", name: "রহিম মিস্ত্রি", amountBdt: 1500, day: "2026-09-30" },
  { id: "b", name: null, amountBdt: 800, day: "2026-09-30" },
];

describe("an entry that looks entered already", () => {
  it("is the same person, the same taka and the same farm day", () => {
    expect(
      looksEnteredAlready(
        { name: " রহিম মিস্ত্রি ", amountBdt: 1500, day: "2026-09-30" },
        earlier
      )?.id
    ).toBe("a");
  });

  it("reads a name whatever its capitals", () => {
    expect(
      looksEnteredAlready(
        { name: "rahim", amountBdt: 200, day: "2026-09-29" },
        [{ id: "c", name: "Rahim", amountBdt: 200, day: "2026-09-29" }]
      )?.id
    ).toBe("c");
  });

  it("is nothing for another day, another amount or another person", () => {
    for (const entry of [
      { name: "রহিম মিস্ত্রি", amountBdt: 1500, day: "2026-09-29" },
      { name: "রহিম মিস্ত্রি", amountBdt: 1501, day: "2026-09-30" },
      { name: "করিম", amountBdt: 1500, day: "2026-09-30" },
    ]) {
      expect(looksEnteredAlready(entry, earlier)).toBeUndefined();
    }
  });

  it("never matches money that named nobody", () => {
    expect(
      looksEnteredAlready(
        { name: "", amountBdt: 800, day: "2026-09-30" },
        earlier
      )
    ).toBeUndefined();
  });
});
