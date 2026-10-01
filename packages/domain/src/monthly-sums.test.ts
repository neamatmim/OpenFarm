import { describe, expect, it } from "vitest";

import { monthlySumsOf, monthlyTermsOf } from "./monthly-sums";

const VENTURE = {
  unitPriceBdt: 50_000,
  targetCapitalBdt: 1_000_000,
  cattleBudgetBdt: 800_000,
  decideBy: "2071-01-20",
  targetWindowStart: "2071-06-01",
};

describe("the terms of a Venture paid by the month", () => {
  it("takes the Cattle Part in the Cattle Budget's proportion, and a sum each 10th up to the Target Window", () => {
    expect(monthlyTermsOf(VENTURE)).toEqual({
      cattlePartBdt: 40_000,
      // February to May: the month it is decided in has none, and June's 10th is inside the window.
      sums: 4,
      firstDueOn: "2071-02-10",
    });
  });

  it("counts a 10th before the window opens and none on or after it", () => {
    const opensOnTheTenth = monthlyTermsOf({
      ...VENTURE,
      targetWindowStart: "2071-05-10",
    });
    const opensOnTheEleventh = monthlyTermsOf({
      ...VENTURE,
      targetWindowStart: "2071-05-11",
    });

    expect(opensOnTheTenth).toMatchObject({ sums: 3 });
    expect(opensOnTheEleventh).toMatchObject({ sums: 4 });
  });

  it("runs across the new year", () => {
    expect(
      monthlyTermsOf({
        ...VENTURE,
        decideBy: "2071-11-05",
        targetWindowStart: "2072-03-01",
      })
    ).toMatchObject({ sums: 3, firstDueOn: "2071-12-10" });
  });

  it("is none where no 10th falls between, or nothing is left to pay", () => {
    expect(
      monthlyTermsOf({ ...VENTURE, targetWindowStart: "2071-02-10" })
    ).toBe("no_month_to_pay_in");
    expect(monthlyTermsOf({ ...VENTURE, cattleBudgetBdt: 1_000_000 })).toBe(
      "nothing_to_pay_monthly"
    );
  });
});

describe("a Unit's Monthly Sums", () => {
  it("add up with its Cattle Part to the Unit price, the last taking what the division left", () => {
    const sums = monthlySumsOf(50_000, {
      cattlePartBdt: 40_000,
      sums: 3,
      firstDueOn: "2071-11-10",
    });

    expect(sums).toEqual([
      { dueOn: "2071-11-10", bdt: 3333 },
      { dueOn: "2071-12-10", bdt: 3333 },
      { dueOn: "2072-01-10", bdt: 3334 },
    ]);
    expect(40_000 + sums.reduce((all, one) => all + one.bdt, 0)).toBe(50_000);
  });

  it("are even where the rest divides", () => {
    const sums = monthlySumsOf(50_000, {
      cattlePartBdt: 40_000,
      sums: 5,
      firstDueOn: "2071-02-10",
    });

    expect(sums.map((one) => one.bdt)).toEqual([2000, 2000, 2000, 2000, 2000]);
    expect(sums.at(-1)?.dueOn).toBe("2071-06-10");
  });
});
