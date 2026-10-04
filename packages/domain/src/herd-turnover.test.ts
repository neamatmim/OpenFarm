import { describe, expect, it } from "vitest";

import type { CowStay } from "./herd-turnover";
import { MASTITIS, dairyTurnover, sicknessOf } from "./herd-turnover";

const day = (on: string) => new Date(`${on}T06:00:00.000Z`);
const YEAR = { from: day("2026-01-01"), until: day("2027-01-01") };

/** A cow in milk the whole year. */
const steady: CowStay = {
  cowFrom: day("2024-03-01"),
  firstCalvedAt: day("2024-03-01"),
  side: "dairy",
  sides: [],
  arrivedAt: day("2023-01-01"),
  left: null,
};

describe("how the dairy herd turns over", () => {
  it("counts every way a cow leaves the milking herd over the cows kept, not only the culls a Mortality records", () => {
    const turnover = dairyTurnover(
      [
        steady,
        steady,
        // Sold to a butcher on 2 July: half a cow-year, one let go.
        { ...steady, left: { how: "sold", at: day("2026-07-02") } },
        // Crossed to Fattening for Eid on 2 July, sold off that side later: one let go, and the sale is not hers.
        {
          ...steady,
          side: "fattening",
          sides: [
            {
              side: "dairy",
              from: day("2023-01-01"),
              until: day("2026-07-02"),
            },
            { side: "fattening", from: day("2026-07-02"), until: null },
          ],
          left: { how: "sold", at: day("2026-09-01") },
        },
        // Died on 2 July.
        { ...steady, left: { how: "died", at: day("2026-07-02") } },
        // A heifer that calved her first on 1 October: a cow from then, and a replacement.
        {
          ...steady,
          cowFrom: day("2026-10-01"),
          firstCalvedAt: day("2026-10-01"),
        },
      ],
      YEAR
    );
    // 2 + ½ + ½ + ½ + ¼ = 3.75 cow-years.
    expect(turnover).toMatchObject({
      cowYears: 3.7,
      died: 1,
      sold: 1,
      crossed: 1,
      culled: 0,
      replacements: 1,
    });
    // Three left for 3.75 cow-years is 80 a hundred; two let go, 53.3.
    expect(turnover.leftPerHundred).toBeCloseTo(80, 0);
    expect(turnover.letGoPerHundred).toBeCloseTo(53.3, 0);
  });

  it("does not count a heifer that leaves before she calves as a cow leaving", () => {
    const turnover = dairyTurnover(
      [
        steady,
        {
          ...steady,
          cowFrom: null,
          firstCalvedAt: null,
          left: { how: "sold", at: day("2026-05-01") },
        },
      ],
      YEAR
    );
    expect(turnover).toMatchObject({ cowYears: 1, sold: 0 });
  });
});

describe("how often the farm's animals fall sick", () => {
  it("counts as mastitis a Diagnosis whose words name it, however the Vet put them", () => {
    const sickness = sicknessOf(
      [
        { side: "dairy", disease: "ক্লিনিক্যাল ম্যাস্টাইটিস (ওলান প্রদাহ)" },
        { side: "dairy", disease: "ওলানে ঘা", diseaseEn: "Subclinical mastitis" },
        { side: "dairy", disease: "দুধ জ্বর" },
      ],
      { dairyHeadYears: 10, fatteningHeadYears: 0, cowYears: 10 }
    );
    expect(sickness.mastitisPerHundredCows).toBe(20);
  });

  it("is Diagnoses for every hundred head kept a year, and mastitis over the cows", () => {
    const sickness = sicknessOf(
      [
        { side: "dairy", disease: MASTITIS },
        { side: "dairy", disease: ` ${MASTITIS}` },
        { side: "dairy", disease: "দুধ জ্বর" },
        { side: "fattening", disease: "নিউমোনিয়া" },
      ],
      { dairyHeadYears: 10, fatteningHeadYears: 20, cowYears: 8 }
    );
    expect(sickness).toEqual({
      dairyPerHundred: 30,
      fatteningPerHundred: 5,
      mastitisPerHundredCows: 25,
      diseases: [
        { disease: MASTITIS, count: 2 },
        { disease: "দুধ জ্বর", count: 1 },
        { disease: "নিউমোনিয়া", count: 1 },
      ],
    });
  });
});
