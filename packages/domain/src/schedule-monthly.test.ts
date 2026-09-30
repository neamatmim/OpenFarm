import { describe, expect, it } from "vitest";

import { scheduleFallsOn } from "./sop";

// Six in the morning at the farm is midnight in Greenwich: the farm day is the date written.
const on = (day: string) => new Date(`${day}T06:00:00.000Z`);
const firstFriday = { weekdays: [5], firstOfTheMonth: true };

describe("a schedule kept monthly", () => {
  it("falls on the first of its day in the month, and no other", () => {
    expect(scheduleFallsOn(firstFriday, on("2026-10-02"))).toBe(true);
    expect(scheduleFallsOn(firstFriday, on("2026-10-09"))).toBe(false);
    expect(scheduleFallsOn(firstFriday, on("2026-10-30"))).toBe(false);
    expect(scheduleFallsOn(firstFriday, on("2026-11-06"))).toBe(true);
  });

  it("falls on no other day of the week", () => {
    expect(scheduleFallsOn(firstFriday, on("2026-10-01"))).toBe(false);
  });
});
