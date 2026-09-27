import { describe, expect, it } from "vitest";

import { seasonOf } from "./eid";

describe("which Season a Target Window is", () => {
  it("is one Season for an Eid, whichever of its days the window carries", () => {
    // The table expects Eid-ul-Adha 2027 on 17 May; announced a day late, the window moves to the 18th–20th.
    const expected = seasonOf({ start: "2027-05-17", end: "2027-05-19" });
    const announced = seasonOf({ start: "2027-05-18", end: "2027-05-20" });
    expect(expected).toEqual({
      key: "eid:2027-05-17",
      eid: "2027-05-17",
      window: { start: "2027-05-17", end: "2027-05-19" },
    });
    expect(announced.key).toBe(expected.key);
  });

  it("is a Season of its own, named by its dates, for a window that is no Eid", () => {
    expect(seasonOf({ start: "2026-12-15", end: "2027-01-15" })).toEqual({
      key: "window:2026-12-15|2027-01-15",
      eid: null,
      window: { start: "2026-12-15", end: "2027-01-15" },
    });
  });

  it("is not an Eid's for a window that starts at Eid but runs on for a month", () => {
    expect(seasonOf({ start: "2027-05-17", end: "2027-06-17" }).eid).toBeNull();
  });
});
