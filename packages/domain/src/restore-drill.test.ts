import { describe, expect, it } from "vitest";

import { drillStanding } from "./restore-drill";

describe("when the next Restore Drill is due", () => {
  it("is a quarter after the last drill", () => {
    expect(
      drillStanding({
        lastDrillOn: "2026-10-14",
        firstGoodCopyOn: "2026-01-01",
        today: "2026-11-01",
      })
    ).toEqual({ dueOn: "2027-01-14", overdue: false });
  });

  it("is overdue the day after it falls due, not on it", () => {
    const due = { lastDrillOn: "2026-07-31", firstGoodCopyOn: null };
    // A quarter after 31 July is the last day of October, the shorter month.
    expect(drillStanding({ ...due, today: "2026-10-31" })).toEqual({
      dueOn: "2026-10-31",
      overdue: false,
    });
    expect(drillStanding({ ...due, today: "2026-11-01" }).overdue).toBe(true);
  });

  it("counts a farm that has never drilled from its first good copy", () => {
    expect(
      drillStanding({
        lastDrillOn: null,
        firstGoodCopyOn: "2026-06-01",
        today: "2026-09-02",
      })
    ).toEqual({ dueOn: "2026-09-01", overdue: true });
  });

  it("asks nothing of a farm with no good copy to restore", () => {
    expect(
      drillStanding({
        lastDrillOn: null,
        firstGoodCopyOn: null,
        today: "2026-09-02",
      })
    ).toEqual({ dueOn: null, overdue: false });
  });
});
