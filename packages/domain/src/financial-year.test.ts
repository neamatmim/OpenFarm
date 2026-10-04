import { DEFAULT_FARM_LOCALE, setFarmLocale } from "@OpenFarm/i18n";
import { afterEach, describe, expect, it } from "vitest";

import {
  daysOfFinancialYear,
  financialYearOf,
  financialYearSpansTwo,
  monthHasBegun,
  monthsOfFinancialYear,
} from "./financial-year";

afterEach(() => {
  setFarmLocale(DEFAULT_FARM_LOCALE);
});

describe("a farm in Bangladesh, whose year runs from July to June", () => {
  it("puts June in the year that began the July before, and July in its own", () => {
    expect(financialYearOf("2026-06-30")).toBe(2025);
    expect(financialYearOf("2026-07-01")).toBe(2026);
    expect(financialYearOf("2026-10")).toBe(2026);
    expect(financialYearOf("2027-01-15")).toBe(2026);
  });

  it("reads a year as its twelve months, across New Year", () => {
    expect(monthsOfFinancialYear(2025)).toEqual([
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("begins a year on the 1st of July and ends it on the 30th of June", () => {
    expect(daysOfFinancialYear(2025)).toEqual({
      from: "2025-07-01",
      to: "2026-06-30",
    });
    expect(financialYearSpansTwo()).toBe(true);
  });
});

describe("a farm whose year is the calendar's", () => {
  it("reads a year from January to December", () => {
    setFarmLocale({ ...DEFAULT_FARM_LOCALE, yearStarts: 1 });

    expect(financialYearOf("2026-01-01")).toBe(2026);
    expect(financialYearOf("2026-12-31")).toBe(2026);
    expect(daysOfFinancialYear(2028)).toEqual({
      from: "2028-01-01",
      to: "2028-12-31",
    });
    expect(financialYearSpansTwo()).toBe(false);
  });

  it("ends a year that begins in March on the last day of February, a leap day where there is one", () => {
    setFarmLocale({ ...DEFAULT_FARM_LOCALE, yearStarts: 3 });

    expect(daysOfFinancialYear(2027)).toEqual({
      from: "2027-03-01",
      to: "2028-02-29",
    });
  });
});

describe("a month that has begun", () => {
  it("is this month or one before it", () => {
    expect(monthHasBegun("2026-10", "2026-10-04")).toBe(true);
    expect(monthHasBegun("2025-12", "2026-10-04")).toBe(true);
    expect(monthHasBegun("2026-11", "2026-10-04")).toBe(false);
  });
});

describe("a year that begins in no month", () => {
  it("is refused rather than read", () => {
    expect(() =>
      setFarmLocale({ ...DEFAULT_FARM_LOCALE, yearStarts: 0 })
    ).toThrow("0 is not a month a year can begin in");
  });
});
