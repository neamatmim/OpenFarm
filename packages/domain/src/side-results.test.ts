import { describe, expect, it } from "vitest";

import { sideResultsOf } from "./side-results";

// Worked by hand. A month of ৳100,000 of milk against ৳60,000 charged to the dairy animals, and bulls sold for
// ৳200,000 whose Margins came to ৳50,000. ৳30,000 of Overheads over 1,000 head-days: the dairy's 600 bear ৳18,000,
// the fattening side's 300 bear ৳9,000, and the Ventures' 100 the remaining ৳3,000.
const MONTH = {
  dairy: { broughtInMoney: 100_000, chargedMoney: 60_000 },
  fattening: { broughtInMoney: 200_000, marginMoney: 50_000 },
  overheadsMoney: 30_000,
  headDays: { dairy: 600, fattening: 300, ventures: 100 },
};

describe("what each Side came to", () => {
  it("is what it brought in less its charges, then less its share of the Overheads by its days", () => {
    const results = sideResultsOf(MONTH);
    expect(results.dairy).toEqual({
      broughtInMoney: 100_000,
      beforeOverheadsMoney: 40_000,
      overheadsMoney: 18_000,
      afterOverheadsMoney: 22_000,
      marginBeforePercent: 40,
      marginAfterPercent: 22,
    });
    expect(results.fattening).toEqual({
      broughtInMoney: 200_000,
      beforeOverheadsMoney: 50_000,
      overheadsMoney: 9000,
      afterOverheadsMoney: 41_000,
      marginBeforePercent: 25,
      marginAfterPercent: 20.5,
    });
  });

  it("leaves the Ventures' animals' days to the Farm, so the shares add up to the Overheads", () => {
    const results = sideResultsOf(MONTH);
    expect(results.restOfOverheadsMoney).toBe(3000);
    expect(results.farm).toEqual({
      broughtInMoney: 300_000,
      beforeOverheadsMoney: 90_000,
      overheadsMoney: 30_000,
      afterOverheadsMoney: 60_000,
      marginBeforePercent: 30,
      marginAfterPercent: 20,
    });
  });

  it("says no margin for a Side that brought nothing in, and keeps a loss below nothing", () => {
    const results = sideResultsOf({
      ...MONTH,
      fattening: { broughtInMoney: 0, marginMoney: null },
    });
    expect(results.fattening).toEqual({
      broughtInMoney: 0,
      beforeOverheadsMoney: 0,
      overheadsMoney: 9000,
      afterOverheadsMoney: -9000,
      marginBeforePercent: null,
      marginAfterPercent: null,
    });
  });

  it("leaves the whole of the Overheads to the Farm where no animal stood", () => {
    const results = sideResultsOf({
      ...MONTH,
      headDays: { dairy: 0, fattening: 0, ventures: 0 },
    });
    expect(results.dairy.overheadsMoney).toBe(0);
    expect(results.fattening.overheadsMoney).toBe(0);
    expect(results.restOfOverheadsMoney).toBe(30_000);
    expect(results.farm.afterOverheadsMoney).toBe(60_000);
  });
});
