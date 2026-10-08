import type { Charge } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import type { FarmCosts } from "./cost-store";
import { costsBySide, narrowedToEach } from "./cost-store";

/**
 * The monthly report asks Costs by Side of thirteen stretches. Each charge is sorted into the stretches it falls in once,
 * and each stretch's figures worked from its own: the same figures as asking of the whole costing.
 */
const day = (iso: string) => new Date(`${iso}T06:00:00.000Z`);

const charge = (
  at: string,
  side: "dairy" | "fattening",
  amount: number
): Charge => ({
  kind: "feed",
  animalId: "cow",
  side,
  at: day(at),
  amount,
  fromId: "straw",
  unpricedKg: 0,
  priced: true,
});

const costs = {
  animals: [],
  charges: [
    charge("2026-01-31", "dairy", 100),
    charge("2026-02-01", "dairy", 200),
    charge("2026-02-15", "fattening", 50),
    charge("2026-03-01", "fattening", 70),
  ],
  liters: [
    { animalId: "cow", side: "dairy", at: day("2026-02-10"), liters: 12 },
  ],
  unallocated: [],
  unallocatedTrips: [],
  unallocatedHerd: [],
  ofAnimal: { charges: new Map(), liters: new Map() },
  sideOf: () => "dairy",
} as unknown as FarmCosts;

const january = { from: day("2026-01-01"), until: day("2026-02-01") };
const february = { from: day("2026-02-01"), until: day("2026-03-01") };
const both = { from: day("2026-01-01"), until: day("2026-03-01") };

describe("the costing narrowed to several stretches at once", () => {
  it("gives each stretch the figures the whole costing gives it", () => {
    const ranges = [january, february, both];
    const narrowed = narrowedToEach(costs, ranges);
    for (const [index, range] of ranges.entries()) {
      expect(costsBySide(narrowed[index] ?? costs, range)).toEqual(
        costsBySide(costs, range)
      );
    }
    expect(costsBySide(narrowed[1] ?? costs, february)).toMatchObject({
      dairy: { feedMoney: 200, litersToBulk: 12 },
      fattening: { feedMoney: 50 },
    });
  });
});
