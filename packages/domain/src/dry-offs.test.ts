import { describe, expect, it } from "vitest";

import { herdDryOffs, lactationsOf } from "./dry-offs";

const day = (iso: string) => new Date(`${iso}T06:00:00.000Z`);

/** A cow in her third Lactation: calved twice here, dried off after each, and calved a third time. */
const thirdLactation = {
  state: "milking",
  lactationNumber: 3,
  lactationStartedAt: day("2026-06-01"),
  calvings: [
    { calvedAt: day("2024-05-01"), lactationNumber: 1 },
    { calvedAt: day("2025-05-10"), lactationNumber: 2 },
    { calvedAt: day("2026-06-01"), lactationNumber: 3 },
  ],
  dryOffs: [
    { lactationNumber: 1, driedAt: day("2025-03-10") },
    { lactationNumber: 2, driedAt: day("2026-04-02") },
  ],
};

describe("a cow's Lactations", () => {
  it("runs each from her calving to her dry-off, and her dry period on to the next calving", () => {
    const [third, second, first] = lactationsOf(
      thirdLactation,
      day("2026-07-01")
    );
    expect(first).toMatchObject({
      lactationNumber: 1,
      lactationDays: 313,
      dryDays: 61,
      stillDry: false,
    });
    expect(second).toMatchObject({
      lactationNumber: 2,
      lactationDays: 327,
      dryDays: 60,
    });
    // In milk now: neither its length nor a dry period yet.
    expect(third).toMatchObject({
      lactationNumber: 3,
      startedAt: day("2026-06-01"),
      driedAt: null,
      lactationDays: null,
      dryDays: null,
    });
  });

  it("counts the days she has stood dry so far, while she waits to calve", () => {
    const [current] = lactationsOf(
      {
        state: "dry",
        lactationNumber: 1,
        lactationStartedAt: day("2025-08-01"),
        calvings: [{ calvedAt: day("2025-08-01"), lactationNumber: 1 }],
        dryOffs: [{ lactationNumber: 1, driedAt: day("2026-06-01") }],
      },
      day("2026-07-01")
    );
    expect(current).toMatchObject({
      lactationDays: 304,
      dryDays: 30,
      stillDry: true,
    });
  });

  it("starts one begun before the farm kept books from the day the register gives, and knows no dry-off it never saw", () => {
    const lactations = lactationsOf(
      {
        state: "milking",
        lactationNumber: 4,
        lactationStartedAt: day("2026-02-01"),
        calvings: [],
        dryOffs: [],
      },
      day("2026-07-01")
    );
    expect(lactations).toEqual([
      expect.objectContaining({
        lactationNumber: 4,
        startedAt: day("2026-02-01"),
        lactationDays: null,
      }),
    ]);
  });

  it("reads a Lactation begun by a change of State from what its dry-off kept, and its dry period to the next one's start", () => {
    const [second, first] = lactationsOf(
      {
        state: "milking",
        lactationNumber: 2,
        lactationStartedAt: day("2026-06-01"),
        calvings: [],
        dryOffs: [
          {
            lactationNumber: 1,
            driedAt: day("2026-04-02"),
            lactationStartedAt: day("2025-05-10"),
          },
        ],
      },
      day("2026-07-01")
    );
    expect(first).toMatchObject({ lactationDays: 327, dryDays: 60 });
    expect(second).toMatchObject({
      startedAt: day("2026-06-01"),
      dryDays: null,
    });
  });
});

describe("the herd's dry periods", () => {
  it("averages the dry periods that ended in the stretch, and the Lactations dried off in it, naming those outside the target", () => {
    const short = {
      state: "milking",
      lactationNumber: 2,
      lactationStartedAt: day("2026-05-01"),
      calvings: [
        { calvedAt: day("2025-05-01"), lactationNumber: 1 },
        { calvedAt: day("2026-05-01"), lactationNumber: 2 },
      ],
      dryOffs: [{ lactationNumber: 1, driedAt: day("2026-04-01") }],
    };
    const year = herdDryOffs(
      [
        { tagNumber: "D-0001", ...thirdLactation },
        { tagNumber: "D-0002", ...short },
      ],
      { from: day("2025-07-01"), until: day("2026-07-01") }
    );
    // D-0001's second dry period (60 days) and D-0002's first (30 days) ended in the stretch; D-0001's first did not.
    expect(year).toMatchObject({
      dryPeriodDays: 45,
      dryPeriods: 2,
      // Dried off in the stretch: D-0001's second (327 days) and D-0002's first (335 days).
      lactationDays: 331,
      lactations: 2,
    });
    expect(year.outsideTarget).toEqual([
      { tagNumber: "D-0002", lactationNumber: 1, dryDays: 30 },
    ]);
  });

  it("says nothing it has nothing to average", () => {
    expect(
      herdDryOffs([], { from: day("2025-07-01"), until: day("2026-07-01") })
    ).toEqual({
      dryPeriodDays: null,
      dryPeriods: 0,
      lactationDays: null,
      lactations: 0,
      outsideTarget: [],
    });
  });
});
