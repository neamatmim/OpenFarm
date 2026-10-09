import { describe, expect, it } from "vitest";

import { receivablesByAge } from "./receivable-ages";

// Read at the end of 31 May 2046, with the farm's thirty days for a Receivable that names no day.
const AS_OF = "2046-05-31";
const owing = (
  leftOn: string,
  owingMoney: number,
  promisedBy: string | null = null
) => ({
  leftOn,
  owingMoney,
  promisedBy,
});

describe("what buyers owe, by how long since it left", () => {
  it("puts each Receivable still owing in its age by the days since it left: 0–7, 8–15, 16–30, 31–60, over 60", () => {
    const ages = receivablesByAge(
      [
        owing("2046-05-31", 1000),
        owing("2046-05-24", 2000),
        owing("2046-05-23", 4000),
        owing("2046-05-16", 8000),
        owing("2046-05-01", 16_000),
        owing("2046-04-01", 32_000),
        owing("2046-03-31", 64_000),
        owing("2046-05-30", 0),
      ],
      AS_OF,
      30
    );

    expect(ages.owingMoney).toBe(127_000);
    expect(ages.ages).toEqual([
      { age: "0-7", owingMoney: 3000 },
      { age: "8-15", owingMoney: 12_000 },
      { age: "16-30", owingMoney: 16_000 },
      { age: "31-60", owingMoney: 32_000 },
      { age: "over-60", owingMoney: 64_000 },
    ]);
  });

  it("says how much of it is overdue: past the day he promised, or past the farm's days where he promised none", () => {
    const ages = receivablesByAge(
      [
        // Promised for the 30th: a day late.
        owing("2046-05-20", 5000, "2046-05-30"),
        // Promised for today: still his.
        owing("2046-05-20", 6000, "2046-05-31"),
        // No promise, gone 30 days: still within the farm's thirty.
        owing("2046-05-01", 7000),
        // No promise, gone 31 days: overdue from the day after the thirty ran.
        owing("2046-04-30", 9000),
      ],
      AS_OF,
      30
    );

    expect(ages.overdueMoney).toBe(14_000);
  });

  it("is nothing at all where nobody owes", () => {
    expect(receivablesByAge([], AS_OF, 30)).toEqual({
      owingMoney: 0,
      overdueMoney: 0,
      ages: [
        { age: "0-7", owingMoney: 0 },
        { age: "8-15", owingMoney: 0 },
        { age: "16-30", owingMoney: 0 },
        { age: "31-60", owingMoney: 0 },
        { age: "over-60", owingMoney: 0 },
      ],
    });
  });
});
