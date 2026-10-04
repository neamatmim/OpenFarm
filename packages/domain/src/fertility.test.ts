import { describe, expect, it } from "vitest";

import type { CowBreeding } from "./fertility";
import { cowsSinceCalving, cyclesOf, herdFertility } from "./fertility";

// Two cows, every figure worked by hand from their dates.

const day = (on: string) => new Date(`${on}T06:00:00.000Z`);

const served = (id: string, animalId: string, on: string) => ({
  id,
  animalId,
  servedAt: day(on),
});

/** Born 2024-01-01. As a heifer: an Attempt the Vet found empty, then one she calved from on 2026-02-08. Served
 *  again sixty days after, and found carrying. */
const asha: CowBreeding = {
  id: "asha",
  tagNumber: "D-0001",
  bornAt: day("2024-01-01"),
  services: [
    served("a1", "asha", "2025-04-01"),
    served("a2", "asha", "2025-05-01"),
    served("a3", "asha", "2026-04-09"),
  ],
  checks: [
    {
      id: "c1",
      serviceId: "a1",
      result: "negative",
      checkedAt: day("2025-05-15"),
    },
    {
      id: "c3",
      serviceId: "a3",
      result: "positive",
      checkedAt: day("2026-05-24"),
    },
  ],
  calvings: [
    { calvedAt: day("2026-02-08"), serviceId: "a2", lactationNumber: 1 },
  ],
};

/** Bought in milk, birth unknown, calved 2025-01-10. Back in heat after her first Attempt, settled from the second,
 *  calved again 2026-01-25. Served 2026-03-01, not yet checked. */
const bela: CowBreeding = {
  id: "bela",
  tagNumber: "D-0002",
  bornAt: null,
  services: [
    served("b1", "bela", "2025-03-01"),
    served("b2", "bela", "2025-04-20"),
    served("b3", "bela", "2026-03-01"),
  ],
  checks: [],
  calvings: [
    { calvedAt: day("2025-01-10"), serviceId: null, lactationNumber: 3 },
    { calvedAt: day("2026-01-25"), serviceId: "b2", lactationNumber: 4 },
  ],
};

describe("a cow's breeding cycles", () => {
  it("runs from her birth as a heifer, then from each calving to the Attempt she settled from", () => {
    expect(cyclesOf(asha)).toMatchObject([
      {
        calvedAt: null,
        firstServiceAt: day("2025-04-01"),
        attempts: 2,
        conceivedAt: day("2025-05-01"),
        nextCalvedAt: day("2026-02-08"),
      },
      {
        calvedAt: day("2026-02-08"),
        firstServiceAt: day("2026-04-09"),
        attempts: 1,
        conceivedAt: day("2026-04-09"),
        nextCalvedAt: null,
      },
    ]);
  });

  it("is open, its Attempts counted so far, while nothing says she settled", () => {
    expect(cyclesOf(bela).at(-1)).toMatchObject({
      calvedAt: day("2026-01-25"),
      attempts: 1,
      conceivedAt: null,
    });
  });
});

describe("the herd's fertility over a year", () => {
  it("reads each measure from the events that fell in the year", () => {
    expect(
      herdFertility([asha, bela], {
        from: day("2026-01-01"),
        until: day("2027-01-01"),
      })
    ).toEqual({
      // Bela's 2025-01-10 to 2026-01-25.
      calvingIntervalDays: 380,
      calvingIntervals: 1,
      // Asha calved 2026-02-08 and settled 2026-04-09.
      daysOpen: 60,
      conceptions: 1,
      // Asha's 60 and Bela's 35, 47.5, rounded.
      daysToFirstService: 48,
      firstServices: 2,
      // Asha's 2026 Attempt took; Bela's is not yet known, and is not counted either way.
      conceptionRate: 1,
      attemptsKnown: 1,
      // 769 days from Asha's birth to her first calving.
      ageAtFirstCalvingMonths: 25.3,
      firstCalvings: 1,
    });
  });

  it("counts a cow back in heat as an Attempt that did not take, and a heifer's as Attempts too", () => {
    const year = herdFertility([asha, bela], {
      from: day("2025-01-01"),
      until: day("2026-01-01"),
    });
    // Asha's empty and her settling, Bela's back-in-heat and her settling: two of four.
    expect(year.conceptionRate).toBe(0.5);
    expect(year.attemptsKnown).toBe(4);
    // Only Bela had calved before she settled: 100 days. A heifer has no calving to count open days from.
    expect(year.daysOpen).toBe(100);
  });

  it("reads age at first calving from first calvings only, not a cow's first calving the farm happened to record", () => {
    // Born 2020, on the farm's opening register in her third Lactation: her first calving here is not her first.
    const chandra: CowBreeding = {
      id: "chandra",
      tagNumber: "D-0003",
      bornAt: day("2020-01-01"),
      services: [],
      checks: [],
      calvings: [
        { calvedAt: day("2026-03-01"), serviceId: null, lactationNumber: 3 },
      ],
    };
    const year = herdFertility([asha, chandra], {
      from: day("2026-01-01"),
      until: day("2027-01-01"),
    });
    expect(year).toMatchObject({
      ageAtFirstCalvingMonths: 25.3,
      firstCalvings: 1,
    });
  });

  it("says nothing of a measure with nothing in the year", () => {
    const empty = herdFertility([asha, bela], {
      from: day("2030-01-01"),
      until: day("2031-01-01"),
    });
    expect(empty).toMatchObject({
      calvingIntervalDays: null,
      daysOpen: null,
      conceptionRate: null,
      ageAtFirstCalvingMonths: null,
    });
  });
});

describe("each cow since she last calved", () => {
  it("puts the cows still open first, the longest since calving at the top", () => {
    const rows = cowsSinceCalving([asha, bela], day("2026-06-01"));
    expect(rows.map((one) => one.tagNumber)).toEqual(["D-0002", "D-0001"]);
    expect(rows[0]).toMatchObject({
      daysSinceCalving: 127,
      attempts: 1,
      daysOpen: null,
      lastCalvingIntervalDays: 380,
    });
    expect(rows[1]).toMatchObject({
      daysOpen: 60,
      lastCalvingIntervalDays: null,
    });
  });
});
