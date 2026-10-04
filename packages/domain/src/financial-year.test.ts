import { describe, expect, it } from "vitest";

import type { YearRules } from "./financial-year";
import {
  financialYearOf,
  financialYearStarting,
  financialYearsBack,
  monthHasBegun,
  monthsOfFinancialYear,
  refusalOfChange,
  refusalOfWithdrawal,
  yearAfter,
} from "./financial-year";

// The years are the farm's (ADR 0016, 0017): July to June until a change, as Bangladesh's income year is. The Cabinet
// decided on 17 August 2026 to move to April–March, with 2027–28 a nine-month Transition Year from July 2027 to March
// 2028 (docs/research/financial-year-changes.md); the cases below are that change and the shapes other countries used.

const JULY: YearRules = { firstStarts: 7, changes: [] };
const TO_APRIL = { changingFrom: "2027-07", newFrom: "2028-04" };
const BANGLADESH: YearRules = { firstStarts: 7, changes: [TO_APRIL] };

describe("years from July, before any change", () => {
  it("puts June in the year that began the July before, and July in its own", () => {
    expect(financialYearOf(JULY, "2026-06-30").start).toBe("2025-07");
    expect(financialYearOf(JULY, "2026-07-01")).toEqual({
      start: "2026-07",
      last: "2027-06",
      from: "2026-07-01",
      to: "2027-06-30",
      months: 12,
    });
  });

  it("reads a year as its twelve months, across New Year", () => {
    expect(monthsOfFinancialYear(financialYearOf(JULY, "2025-07"))).toEqual([
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

  it("knows only the months a year begins in", () => {
    expect(financialYearStarting(JULY, "2025-07")?.months).toBe(12);
    expect(financialYearStarting(JULY, "2025-08")).toBeNull();
  });
});

describe("Bangladesh's move to April–March", () => {
  it("makes 2027–28 a nine-month year, July to March, and begins April years after it", () => {
    expect(financialYearOf(BANGLADESH, "2026-12-01")).toMatchObject({
      start: "2026-07",
      months: 12,
    });
    expect(financialYearOf(BANGLADESH, "2027-10-15")).toEqual({
      start: "2027-07",
      last: "2028-03",
      from: "2027-07-01",
      to: "2028-03-31",
      months: 9,
    });
    expect(financialYearOf(BANGLADESH, "2028-04-01")).toMatchObject({
      start: "2028-04",
      last: "2029-03",
      months: 12,
    });
  });

  it("lists the years back through the change, newest first, each its own length", () => {
    expect(
      financialYearsBack(BANGLADESH, "2029-05-01", "2026-01-01").map((one) => [
        one.start,
        one.months,
      ])
    ).toEqual([
      ["2029-04", 12],
      ["2028-04", 12],
      ["2027-07", 9],
      ["2026-07", 12],
      ["2025-07", 12],
    ]);
  });
});

describe("other shapes a change has taken", () => {
  it("bridges with a year longer than twelve months, as Sweden's 1995/96 ran eighteen", () => {
    const sweden: YearRules = {
      firstStarts: 7,
      changes: [{ changingFrom: "1995-07", newFrom: "1997-01" }],
    };
    const bridge = financialYearOf(sweden, "1996-08");

    expect(bridge).toMatchObject({ start: "1995-07", last: "1996-12" });
    expect(bridge.months).toBe(18);
    expect(yearAfter(sweden, bridge)).toMatchObject({
      start: "1997-01",
      last: "1997-12",
    });
  });

  it("moves a year later in the same calendar year and back again, as Myanmar did in 2018 and 2022", () => {
    const myanmar: YearRules = {
      firstStarts: 4,
      changes: [
        { changingFrom: "2018-04", newFrom: "2018-10" },
        { changingFrom: "2021-10", newFrom: "2022-04" },
      ],
    };

    expect(
      financialYearsBack(myanmar, "2022-05-01", "2018-01-01").map((one) => [
        one.start,
        one.months,
      ])
    ).toEqual([
      ["2022-04", 12],
      ["2021-10", 6],
      ["2020-10", 12],
      ["2019-10", 12],
      ["2018-10", 12],
      ["2018-04", 6],
      ["2017-04", 12],
    ]);
  });
});

describe("recording a change", () => {
  it("takes Bangladesh's, recorded the autumn before", () => {
    expect(refusalOfChange(JULY, TO_APRIL, "2026-10-05")).toBeNull();
  });

  it("takes one that changes this year, after it has begun", () => {
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2026-07", newFrom: "2027-04" },
        "2026-10-05"
      )
    ).toBeNull();
  });

  it("refuses to move a year that has ended", () => {
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2025-07", newFrom: "2026-04" },
        "2026-10-05"
      )
    ).toBe("year_change_reaches_an_ended_year");
  });

  it("refuses a Transition Year that has already ended", () => {
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2026-07", newFrom: "2026-09" },
        "2026-10-05"
      )
    ).toBe("year_change_reaches_an_ended_year");
  });

  it("refuses a month no year begins in, and one before the last change", () => {
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2027-08", newFrom: "2028-04" },
        "2026-10-05"
      )
    ).toBe("year_change_not_a_year");
    expect(
      refusalOfChange(
        BANGLADESH,
        { changingFrom: "2026-07", newFrom: "2027-01" },
        "2026-10-05"
      )
    ).toBe("year_change_not_a_year");
  });

  it("refuses a change that keeps the month, and one over two years long", () => {
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2027-07", newFrom: "2028-07" },
        "2026-10-05"
      )
    ).toBe("year_change_changes_nothing");
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2027-07", newFrom: "2029-08" },
        "2026-10-05"
      )
    ).toBe("year_change_too_long");
    expect(
      refusalOfChange(
        JULY,
        { changingFrom: "2027-07", newFrom: "2027-04" },
        "2026-10-05"
      )
    ).toBe("year_change_too_long");
  });

  it("takes a second change after the first, back to the old year", () => {
    expect(
      refusalOfChange(
        BANGLADESH,
        { changingFrom: "2029-04", newFrom: "2029-07" },
        "2026-10-05"
      )
    ).toBeNull();
  });
});

describe("taking a change back", () => {
  it("takes back the latest while its years are still to end", () => {
    expect(refusalOfWithdrawal(BANGLADESH, TO_APRIL, "2027-11-01")).toBeNull();
  });

  it("keeps it once its Transition Year has ended", () => {
    expect(refusalOfWithdrawal(BANGLADESH, TO_APRIL, "2028-04-01")).toBe(
      "year_change_reaches_an_ended_year"
    );
  });

  it("keeps an earlier change while a later one stands", () => {
    const twice: YearRules = {
      firstStarts: 7,
      changes: [TO_APRIL, { changingFrom: "2029-04", newFrom: "2029-07" }],
    };

    expect(refusalOfWithdrawal(twice, TO_APRIL, "2026-10-05")).toBe(
      "year_change_not_the_last"
    );
  });
});

describe("a month that has begun", () => {
  it("is this month or one before it", () => {
    expect(monthHasBegun("2026-10", "2026-10-04")).toBe(true);
    expect(monthHasBegun("2026-11", "2026-10-04")).toBe(false);
  });
});
