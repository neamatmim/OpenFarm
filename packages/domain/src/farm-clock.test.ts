import { DEFAULT_FARM_LOCALE, setFarmLocale } from "@OpenFarm/i18n";
import { afterEach, describe, expect, it } from "vitest";

import {
  atFarmTime,
  farmDayOf,
  farmDaysApart,
  farmDaysBetween,
  farmTimeOf,
  startOfFarmDay,
} from "./farm-clock";

const at = (iso: string) => new Date(iso);

// London went onto summer time at 01:00 UTC on 29 March 2026 and comes off it at 01:00 UTC on 25 October.
const inLondon = () =>
  setFarmLocale({ ...DEFAULT_FARM_LOCALE, timeZone: "Europe/London" });

afterEach(() => {
  setFarmLocale(DEFAULT_FARM_LOCALE);
});

describe("the farm's own clock, in Dhaka", () => {
  it("starts a farm day at midnight in Dhaka, six hours before it is midnight in UTC", () => {
    expect(startOfFarmDay("2026-10-03")).toEqual(at("2026-10-02T18:00:00Z"));
  });

  it("reads the day an instant falls on from Dhaka's wall clock", () => {
    expect(farmDayOf(at("2026-10-02T17:59:59Z"))).toBe("2026-10-02");
    expect(farmDayOf(at("2026-10-02T18:00:00Z"))).toBe("2026-10-03");
  });

  it("reads the time of day off the same clock", () => {
    expect(farmTimeOf(at("2026-10-03T00:30:00Z"))).toBe("06:30");
  });

  it("puts a farm day's time of day on the instant it falls at", () => {
    expect(atFarmTime("2026-10-03", "05:00")).toEqual(
      at("2026-10-02T23:00:00Z")
    );
  });

  it("counts days apart and bounds a run of them", () => {
    expect(farmDaysApart("2026-09-30", "2026-10-03")).toBe(3);
    expect(farmDaysApart("2026-10-03", "2026-09-30")).toBe(-3);
    expect(farmDaysBetween("2026-10-01", "2026-10-03")).toEqual({
      from: at("2026-09-30T18:00:00Z"),
      until: at("2026-10-03T18:00:00Z"),
    });
  });
});

describe("the farm's own clock, where the clocks change", () => {
  it("starts each day at that day's own midnight, before the change and after it", () => {
    inLondon();
    expect(startOfFarmDay("2026-03-29")).toEqual(at("2026-03-29T00:00:00Z"));
    expect(startOfFarmDay("2026-03-30")).toEqual(at("2026-03-29T23:00:00Z"));
    expect(startOfFarmDay("2026-10-26")).toEqual(at("2026-10-26T00:00:00Z"));
  });

  it("bounds the day the clocks go forward at its own 23 hours", () => {
    inLondon();
    expect(farmDaysBetween("2026-03-29", "2026-03-29")).toEqual({
      from: at("2026-03-29T00:00:00Z"),
      until: at("2026-03-29T23:00:00Z"),
    });
  });

  it("reads a summer night after midnight as the next day, at its own time", () => {
    inLondon();
    expect(farmDayOf(at("2026-06-01T23:30:00Z"))).toBe("2026-06-02");
    expect(farmTimeOf(at("2026-06-01T23:30:00Z"))).toBe("00:30");
  });

  it("puts noon on the day the clocks go back on winter time", () => {
    inLondon();
    expect(atFarmTime("2026-10-25", "12:00")).toEqual(
      at("2026-10-25T12:00:00Z")
    );
  });

  it("counts the days across a change as days, not hours", () => {
    inLondon();
    expect(farmDaysApart("2026-03-28", "2026-03-31")).toBe(3);
    expect(farmDaysApart("2026-10-24", "2026-10-27")).toBe(3);
  });
});

describe("a farm whose clock is not a whole hour from UTC", () => {
  it("starts its day at its own midnight, a quarter past six UTC in Kathmandu", () => {
    setFarmLocale({ ...DEFAULT_FARM_LOCALE, timeZone: "Asia/Kathmandu" });
    expect(farmDayOf(at("2026-10-02T18:14:59Z"))).toBe("2026-10-02");
    expect(farmDayOf(at("2026-10-02T18:15:00Z"))).toBe("2026-10-03");
    expect(farmTimeOf(at("2026-10-02T18:44:59Z"))).toBe("00:29");
    expect(startOfFarmDay("2026-10-03")).toEqual(at("2026-10-02T18:15:00Z"));
  });

  it("reads the same day again after reading another zone's", () => {
    expect(farmDayOf(at("2026-10-02T18:00:00Z"))).toBe("2026-10-03");
    inLondon();
    expect(farmDayOf(at("2026-10-02T18:00:00Z"))).toBe("2026-10-02");
  });
});

describe("where the farm is", () => {
  it("refuses a time zone nobody knows, rather than reading every day as UTC", () => {
    expect(() =>
      setFarmLocale({ ...DEFAULT_FARM_LOCALE, timeZone: "Asia/Nowhere" })
    ).toThrow("Asia/Nowhere");
  });
});
