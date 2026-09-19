import { describe, expect, it } from "vitest";

import { lastMonth, saidMonth } from "./months";

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
