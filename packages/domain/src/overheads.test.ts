import { describe, expect, it } from "vitest";

import { startOfFarmDay } from "./farm-clock";
import { headDaysIn, overheadsOver } from "./overheads";

const on = (day: string) => startOfFarmDay(day);
const SEPTEMBER = { from: on("2026-09-01"), until: on("2026-10-01") };

describe("the days the animals stood here", () => {
  it("counts an animal here all month as the month's days", () => {
    expect(
      headDaysIn([{ from: on("2026-08-01"), until: null }], SEPTEMBER)
    ).toBe(30);
  });

  it("counts one who came mid-month from the day she came, and one who left until she left", () => {
    expect(
      headDaysIn(
        [
          { from: on("2026-09-16"), until: null },
          { from: on("2026-08-01"), until: on("2026-09-11") },
        ],
        SEPTEMBER
      )
    ).toBe(15 + 10);
  });

  it("counts a move between Pens as the same animal, not two", () => {
    expect(
      headDaysIn(
        [
          { from: on("2026-08-01"), until: on("2026-09-10") },
          { from: on("2026-09-10"), until: null },
        ],
        SEPTEMBER
      )
    ).toBe(30);
  });

  it("counts nothing for a stretch nobody stood in", () => {
    expect(
      headDaysIn([{ from: on("2026-10-05"), until: null }], SEPTEMBER)
    ).toBe(0);
  });
});

describe("what the place cost", () => {
  const rent = {
    categoryId: "rent",
    categoryBn: "শেড ভাড়া",
    categoryEn: "Shed rent",
  };
  const wages = {
    categoryId: "wages",
    categoryBn: "মজুরি",
    categoryEn: "Wages",
  };

  it("adds up by Category, the largest first, and says what it comes to a head a day", () => {
    const figure = overheadsOver({
      money: [
        { ...rent, bdt: 18_000 },
        { ...wages, bdt: 14_000 },
        { ...wages, bdt: 12_000 },
      ],
      // Twenty head all of September.
      headDays: 600,
    });
    expect(figure).toEqual({
      totalBdt: 44_000,
      lines: [
        { ...wages, bdt: 26_000 },
        { ...rent, bdt: 18_000 },
      ],
      headDays: 600,
      perHeadPerDayBdt: 73.33,
    });
  });

  it("says nothing a head a day where no animal stood", () => {
    expect(
      overheadsOver({ money: [{ ...rent, bdt: 18_000 }], headDays: 0 })
        .perHeadPerDayBdt
    ).toBeNull();
  });
});
