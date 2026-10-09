import { describe, expect, it } from "vitest";

import { startOfFarmDay } from "./farm-clock";
import { headDaysBySide, headDaysIn, overheadsOver } from "./overheads";

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

/** One owner throughout: the Farm's (null) or a Venture's. */
const always = (ventureId: string | null) => [{ from: new Date(0), ventureId }];

describe("the days the animals stood here, by Side and whose", () => {
  it("counts the Farm's own on the Side they stood on, and a Venture's apart, whichever Side", () => {
    expect(
      headDaysBySide(
        [
          {
            animalId: "cow",
            side: "dairy",
            from: on("2026-08-01"),
            until: null,
          },
          {
            animalId: "bull",
            side: "fattening",
            from: on("2026-09-16"),
            until: null,
          },
          {
            animalId: "theirs",
            side: "fattening",
            from: on("2026-08-01"),
            until: null,
          },
        ],
        (animalId) => always(animalId === "theirs" ? "venture" : null),
        SEPTEMBER
      )
    ).toEqual({ dairy: 30, fattening: 15, ventures: 30 });
  });

  it("splits an animal's days at the moment she changed hands", () => {
    // The Farm's own until a Venture bought her, handed over on the 11th: ten days the Farm's, twenty the Venture's.
    expect(
      headDaysBySide(
        [
          {
            animalId: "bull",
            side: "fattening",
            from: on("2026-08-01"),
            until: null,
          },
        ],
        () => [
          { from: new Date(0), ventureId: null },
          { from: on("2026-09-11"), ventureId: "venture" },
        ],
        SEPTEMBER
      )
    ).toEqual({ dairy: 0, fattening: 10, ventures: 20 });
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
        { ...rent, amount: 18_000 },
        { ...wages, amount: 14_000 },
        { ...wages, amount: 12_000 },
      ],
      // Twenty head all of September.
      headDays: 600,
    });
    expect(figure).toEqual({
      totalMoney: 44_000,
      lines: [
        { ...wages, amount: 26_000 },
        { ...rent, amount: 18_000 },
      ],
      headDays: 600,
      perHeadPerDayMoney: 73.33,
    });
  });

  it("says nothing a head a day where no animal stood", () => {
    expect(
      overheadsOver({ money: [{ ...rent, amount: 18_000 }], headDays: 0 })
        .perHeadPerDayMoney
    ).toBeNull();
  });
});
