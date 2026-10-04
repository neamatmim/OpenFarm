import { describe, expect, it } from "vitest";

import {
  fromTheFirstWithAnything,
  lastMonth,
  financialYearName,
  financialYearNamed,
  saidMonth,
} from "./months";

// A month is stored as 2026-08 and read as আগস্ট ২০২৬. Two screens say one — a Venture's bank badge and the line on
// the Owner's own page — and a farm that has to decode a date format in the middle of a Bangla sentence has been
// handed the database's answer rather than the farm's.

describe("a month as the farm says it", () => {
  it("words the month and numbers the year in Bangla", () => {
    expect(saidMonth("2026-08", "bn")).toBe("আগস্ট ২০২৬");
  });

  it("words it in English for a reader in English", () => {
    expect(saidMonth("2026-08", "en")).toBe("August 2026");
  });

  it("says December of the year it belongs to, not January of the next", () => {
    // The farm's own clock is Asia/Dhaka: 2026-12-01 is still November in UTC, and a Venture whose account was read
    // to December would otherwise be told it was read to November.
    expect(saidMonth("2026-12", "bn")).toBe("ডিসেম্বর ২০২৬");
    expect(saidMonth("2026-01", "bn")).toBe("জানুয়ারি ২০২৬");
  });
});

describe("the month before this one", () => {
  it("is a month of the shape a stored month has", () => {
    expect(lastMonth()).toMatch(/^\d{4}-\d{2}$/u);
  });

  it("is before the month it is asked in", () => {
    const today = new Date();
    expect(
      lastMonth() <
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
    ).toBe(true);
  });
});

/** A month in which only this much money came in. */
const month = (name: string, inMoney: number) => ({
  name,
  money: { inMoney, outMoney: 0 },
  dairy: { milkSoldMoney: 0, chargedMoney: 0, litresToBulk: 0 },
  fattening: { chargedMoney: 0, sold: 0 },
});

describe("the months a farm is shown", () => {
  it("begins at the first month anything happened in, and keeps a quiet month after it", () => {
    const shown = fromTheFirstWithAnything([
      month("2026-05", 0),
      month("2026-06", 500),
      month("2026-07", 0),
      month("2026-08", 900),
    ]);
    expect(shown.map((one) => one.name)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("is this month alone for a farm with nothing yet", () => {
    const shown = fromTheFirstWithAnything([
      month("2026-08", 0),
      month("2026-09", 0),
    ]);
    expect(shown.map((one) => one.name)).toEqual(["2026-09"]);
  });
});

/** The words a name is said in, as the key and what fills it, so a test reads which words were asked for. */
const t = (key: string, params?: Record<string, unknown>) =>
  `${key} ${JSON.stringify(params)}`;

describe("a financial year's name", () => {
  it("is both its years, as the accountant writes the income year, in the reader's digits", () => {
    const year = { start: "2025-07", last: "2026-06", months: 12 };

    expect(financialYearName(year, t, "en")).toBe("2025–26");
    expect(financialYearName(year, t, "bn")).toBe("২০২৫–২৬");
    expect(
      financialYearName(
        { start: "2099-07", last: "2100-06", months: 12 },
        t,
        "en"
      )
    ).toBe("2099–00");
  });

  it("is one year where it begins and ends in it", () => {
    expect(
      financialYearName(
        { start: "2025-01", last: "2025-12", months: 12 },
        t,
        "bn"
      )
    ).toBe("২০২৫");
  });

  it("says its length beside its name when it is not twelve months", () => {
    expect(
      financialYearName(
        { start: "2027-07", last: "2028-03", months: 9 },
        t,
        "bn"
      )
    ).toBe('years.oddLength {"name":"২০২৭–২৮","months":9}');
  });
});

describe("a financial year in the address", () => {
  it("is a month a year begins in, or nothing", () => {
    expect(financialYearNamed("2027-07")).toBe("2027-07");
    expect(financialYearNamed("2027-13")).toBeUndefined();
    expect(financialYearNamed(2027)).toBeUndefined();
  });
});
