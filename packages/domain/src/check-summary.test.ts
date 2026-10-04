import { describe, expect, it } from "vitest";

import type { WorkToCheck } from "./check-summary";
import { checkSummaryOf } from "./check-summary";

const round: WorkToCheck = {
  dueAt: new Date("2027-01-01T02:00:00.000Z"),
  graceMinutes: 120,
  completedAt: new Date("2027-01-01T03:00:00.000Z"),
  steps: [
    {
      id: "look",
      skipReasons: [
        { bn: "সুস্থ", means: "nothing_to_note" },
        { bn: "পাওয়া যায়নি", means: "not_found" },
      ],
    },
  ],
  completions: [
    { stepId: "look", status: "done", skipReason: null, outOfRange: null },
    { stepId: "look", status: "skipped", skipReason: "সুস্থ", outOfRange: null },
    { stepId: "look", status: "skipped", skipReason: "সুস্থ", outOfRange: null },
  ],
  milk: null,
  fed: null,
};

describe("what a piece of work came to, for its check", () => {
  it("counts animals passed as well as looked at, and is clean on time with nothing flagged", () => {
    expect(checkSummaryOf(round)).toMatchObject({
      done: 1,
      passedWell: 2,
      skipped: 0,
      late: false,
      flagged: false,
      clean: true,
    });
  });

  it("is not clean finished past its grace, with an animal skipped for another reason, or with anything flagged", () => {
    expect(
      checkSummaryOf({
        ...round,
        completedAt: new Date("2027-01-01T04:30:00.000Z"),
      })
    ).toMatchObject({ late: true, clean: false });
    expect(
      checkSummaryOf({
        ...round,
        completions: [
          ...round.completions,
          {
            stepId: "look",
            status: "skipped",
            skipReason: "পাওয়া যায়নি",
            outOfRange: null,
          },
        ],
      })
    ).toMatchObject({ skipped: 1, clean: false });
    expect(
      checkSummaryOf({
        ...round,
        milk: { bulkLitres: 80, differenceLitres: -6, flagged: true },
      })
    ).toMatchObject({
      milk: { bulkLitres: 80, differenceLitres: -6 },
      flagged: true,
      clean: false,
    });
    expect(
      checkSummaryOf({ ...round, fed: { shortfallPercent: 12, flagged: true } })
    ).toMatchObject({ shortFedPercent: 12, clean: false });
  });
});
