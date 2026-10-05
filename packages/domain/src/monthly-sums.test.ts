import { describe, expect, it } from "vitest";

import {
  capitalItMayHold,
  cattleMoneyOf,
  monthlySumsOf,
  monthlyTermsOf,
  sumsStandingOf,
  takesCapital,
} from "./monthly-sums";

const VENTURE = {
  unitPriceMoney: 50_000,
  targetCapitalMoney: 1_000_000,
  cattleBudgetMoney: 800_000,
  decideBy: "2071-01-20",
  targetWindowStart: "2071-06-01",
};

describe("the terms of a Venture paid by the month", () => {
  it("takes the Cattle Part in the Cattle Budget's proportion, and a sum each 10th up to the Target Window", () => {
    expect(monthlyTermsOf(VENTURE)).toEqual({
      cattlePartMoney: 40_000,
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
    expect(monthlyTermsOf({ ...VENTURE, cattleBudgetMoney: 1_000_000 })).toBe(
      "nothing_to_pay_monthly"
    );
  });
});

describe("a Unit's Monthly Sums", () => {
  it("add up with its Cattle Part to the Unit price, the last taking what the division left", () => {
    const sums = monthlySumsOf(50_000, {
      cattlePartMoney: 40_000,
      sums: 3,
      firstDueOn: "2071-11-10",
    });

    expect(sums).toEqual([
      { dueOn: "2071-11-10", amount: 3333 },
      { dueOn: "2071-12-10", amount: 3333 },
      { dueOn: "2072-01-10", amount: 3334 },
    ]);
    expect(40_000 + sums.reduce((all, one) => all + one.amount, 0)).toBe(
      50_000
    );
  });

  it("are even where the rest divides", () => {
    const sums = monthlySumsOf(50_000, {
      cattlePartMoney: 40_000,
      sums: 5,
      firstDueOn: "2071-02-10",
    });

    expect(sums.map((one) => one.amount)).toEqual([
      2000, 2000, 2000, 2000, 2000,
    ]);
    expect(sums.at(-1)?.dueOn).toBe("2071-06-10");
  });
});

const BY_THE_MONTH = {
  capitalPaid: "by_the_month" as const,
  unitPriceMoney: 50_000,
  cattlePartMoney: 40_000,
  targetCapitalMoney: 1_000_000,
  cattleBudgetMoney: 800_000,
};

describe("what an Agreement may have paid in", () => {
  it("is its Units' Cattle Part while a Venture paid by the month is open, and their whole price after", () => {
    expect(capitalItMayHold(3, { ...BY_THE_MONTH, state: "open" })).toBe(
      120_000
    );
    expect(capitalItMayHold(3, { ...BY_THE_MONTH, state: "buying" })).toBe(
      150_000
    );
  });

  it("is always their whole price for a Venture paid before buying", () => {
    expect(
      capitalItMayHold(3, {
        ...BY_THE_MONTH,
        capitalPaid: "before_buying",
        cattlePartMoney: null,
        state: "open",
      })
    ).toBe(150_000);
  });
});

describe("how much of a Venture's capital is cattle money", () => {
  it("is all of it up to the signed Cattle Parts when paid by the month, and the Monthly Sums past that are not", () => {
    expect(cattleMoneyOf(300_000, BY_THE_MONTH, 13)).toBe(300_000);
    expect(cattleMoneyOf(520_000, BY_THE_MONTH, 13)).toBe(520_000);
    expect(cattleMoneyOf(552_500, BY_THE_MONTH, 13)).toBe(520_000);
  });

  it("is the plan's proportion when paid before buying", () => {
    expect(
      cattleMoneyOf(
        300_000,
        {
          ...BY_THE_MONTH,
          capitalPaid: "before_buying",
          cattlePartMoney: null,
        },
        10
      )
    ).toBe(240_000);
  });
});

// Three Units of fifty thousand: 1,20,000 before buying, then 7,500 on each 10th, February to May.
const SCHEDULE = {
  cattlePartMoney: 40_000,
  sums: [
    { dueOn: "2074-02-10", amount: 2500 },
    { dueOn: "2074-03-10", amount: 2500 },
    { dueOn: "2074-04-10", amount: 2500 },
    { dueOn: "2074-05-10", amount: 2500 },
  ],
};
const standing = (paidMoney: number, today: string) =>
  sumsStandingOf({
    units: 3,
    unitPriceMoney: 50_000,
    monthly: SCHEDULE,
    paidMoney,
    today,
  });

describe("where an Agreement stands against its Monthly Sums", () => {
  it("owes nothing yet due before the first 10th, and says the next", () => {
    expect(standing(120_000, "2074-02-01")).toEqual({
      owedMoney: 30_000,
      dueMoney: 0,
      missedMoney: 0,
      next: { dueOn: "2074-02-10", amount: 7500 },
      sumsPaid: 0,
      sums: 4,
      lastMissedOn: null,
    });
  });

  it("is due on the 10th, still only late on the 17th, and missed from the 18th", () => {
    expect(standing(120_000, "2074-02-10")).toMatchObject({
      dueMoney: 7500,
      missedMoney: 0,
    });
    expect(standing(120_000, "2074-02-17")).toMatchObject({ missedMoney: 0 });
    expect(standing(120_000, "2074-02-18")).toMatchObject({
      dueMoney: 7500,
      missedMoney: 7500,
    });
  });

  it("clears the oldest sum first when he pays what he is behind on", () => {
    // February and March both owed, and one sum paid: it is February's, so only March is late.
    expect(standing(127_500, "2074-03-20")).toMatchObject({
      dueMoney: 7500,
      missedMoney: 7500,
      sumsPaid: 1,
      lastMissedOn: "2074-03-10",
    });
    expect(standing(135_000, "2074-03-20")).toMatchObject({
      dueMoney: 0,
      missedMoney: 0,
      next: { dueOn: "2074-04-10", amount: 7500 },
    });
  });

  it("says as next the first sum still unpaid, not one paid ahead", () => {
    // February paid, and April's sent early with March's: the next he owes is May's.
    expect(standing(142_500, "2074-02-20")).toMatchObject({
      dueMoney: 0,
      next: { dueOn: "2074-05-10", amount: 7500 },
    });
    // Part of March's sent early: the rest of it is what is next.
    expect(standing(130_000, "2074-02-20")).toMatchObject({
      next: { dueOn: "2074-03-10", amount: 5000 },
    });
    // Every sum paid ahead: nothing is next.
    expect(standing(150_000, "2074-02-20")).toMatchObject({ next: null });
  });

  it("has no next sum once the last is due, and owes nothing once all is paid", () => {
    expect(standing(150_000, "2074-05-20")).toEqual({
      owedMoney: 0,
      dueMoney: 0,
      missedMoney: 0,
      next: null,
      sumsPaid: 4,
      sums: 4,
      lastMissedOn: null,
    });
  });
});

describe("whether a Venture takes capital", () => {
  it("takes it Open, and paid by the month while buying and fattening, never once selling", () => {
    const monthly = { capitalPaid: "by_the_month" as const };
    const before = { capitalPaid: "before_buying" as const };

    expect(takesCapital({ ...monthly, state: "open" })).toBe(true);
    expect(takesCapital({ ...monthly, state: "buying" })).toBe(true);
    expect(takesCapital({ ...monthly, state: "fattening" })).toBe(true);
    expect(takesCapital({ ...monthly, state: "selling" })).toBe(false);
    expect(takesCapital({ ...before, state: "open" })).toBe(true);
    expect(takesCapital({ ...before, state: "buying" })).toBe(false);
  });
});

describe("the latest missed sum", () => {
  it("is the newest one past its seven days, which is what a month's notice is keyed on", () => {
    // Nothing paid since the Cattle Part: February and March both missed by the 20th of March, April not yet due.
    expect(standing(120_000, "2074-03-20")).toMatchObject({
      missedMoney: 15_000,
      sumsPaid: 0,
      lastMissedOn: "2074-03-10",
    });
    // March is only late on the 17th: February is the latest missed.
    expect(standing(120_000, "2074-03-17")).toMatchObject({
      lastMissedOn: "2074-02-10",
    });
  });
});
