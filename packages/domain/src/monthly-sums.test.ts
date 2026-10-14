import { describe, expect, it } from "vitest";

import {
  askThisMonth,
  capitalItMayHold,
  cattleMoneyOf,
  dueByMonthEndOf,
  monthlyPaymentAllocationOf,
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
  it("is the whole signed price, including while gathering cattle capital", () => {
    expect(capitalItMayHold(3, { ...BY_THE_MONTH, state: "open" })).toBe(
      150_000
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
      oldestOwedOn: null,
      cattlePartOwedMoney: 0,
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
      oldestOwedOn: null,
      cattlePartOwedMoney: 0,
    });
  });

  it("says since when he has been behind: the oldest sum fallen due and not yet paid", () => {
    // Nothing paid since the Cattle Part: behind since February's 10th, however many sums since.
    expect(standing(120_000, "2074-03-20")).toMatchObject({
      oldestOwedOn: "2074-02-10",
    });
    // February paid: behind since March's.
    expect(standing(127_500, "2074-03-20")).toMatchObject({
      oldestOwedOn: "2074-03-10",
    });
    // A sum not yet due is not one he is behind on.
    expect(standing(127_500, "2074-03-09")).toMatchObject({
      oldestOwedOn: null,
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

describe("what the Owner rings about this month", () => {
  it("counts a Cattle Part not yet in as behind, and says so, before any sum is due", () => {
    // 1,00,000 of three Units' 1,20,000 Cattle Part in, and February's sum not yet due.
    expect(askThisMonth(standing(100_000, "2074-02-01"), "2074-02-01")).toEqual(
      {
        standing: "missed",
        dueMoney: 20_000,
        missedMoney: 20_000,
        cattlePartMoney: 20_000,
        dueOn: "2074-02-01",
        behindSince: null,
        daysBehind: null,
      }
    );
  });

  it("says no Cattle Part once it is all in", () => {
    expect(
      askThisMonth(standing(120_000, "2074-02-12"), "2074-02-12")
    ).toMatchObject({ standing: "late", cattlePartMoney: 0, daysBehind: 2 });
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

describe("confirmed receipts allocated against the original schedule", () => {
  const monthly = {
    cattlePartMoney: 40_000,
    sums: monthlySumsOf(58_000, {
      cattlePartMoney: 40_000,
      sums: 9,
      firstDueOn: "2071-02-10",
    }),
  };
  const allocate = (paidMoney: number, today = "2071-01-05", units = 1) =>
    monthlyPaymentAllocationOf({
      units,
      unitPriceMoney: 58_000,
      monthly,
      paidMoney,
      today,
    });

  it("allocates 45,000 as 40,000 cattle and 5,000 monthly, including a half-paid third sum", () => {
    const allocation = allocate(45_000);
    expect(allocation).toMatchObject({
      cattlePaidMoney: 40_000,
      monthlyPaidMoney: 5000,
      paidEarlyMoney: 5000,
      owedMoney: 13_000,
    });
    expect(allocation.sums.slice(0, 3)).toEqual([
      {
        dueOn: "2071-02-10",
        amountMoney: 2000,
        paidMoney: 2000,
        leftMoney: 0,
      },
      {
        dueOn: "2071-03-10",
        amountMoney: 2000,
        paidMoney: 2000,
        leftMoney: 0,
      },
      {
        dueOn: "2071-04-10",
        amountMoney: 2000,
        paidMoney: 1000,
        leftMoney: 1000,
      },
    ]);
    expect(
      sumsStandingOf({
        units: 1,
        unitPriceMoney: 58_000,
        monthly,
        paidMoney: 45_000,
        today: "2071-01-05",
      })
    ).toMatchObject({
      next: { dueOn: "2071-04-10", amount: 1000 },
      sumsPaid: 2,
      dueMoney: 0,
    });
  });

  it("clears arrears first and counts only future sums as paid ahead", () => {
    expect(allocate(45_000, "2071-03-10").paidEarlyMoney).toBe(1000);
    expect(allocate(45_000, "2071-04-10").paidEarlyMoney).toBe(0);
  });

  it("keeps amounts and dates across multi-unit, zero and full payments", () => {
    expect(allocate(90_000, "2071-01-05", 2)).toMatchObject({
      cattlePaidMoney: 80_000,
      monthlyPaidMoney: 10_000,
      owedMoney: 26_000,
    });
    expect(allocate(0).sums.every((one) => one.paidMoney === 0)).toBe(true);
    const full = allocate(58_000);
    expect(full.owedMoney).toBe(0);
    expect(full.sums.every((one) => one.leftMoney === 0)).toBe(true);
    expect(full.sums.map((one) => one.dueOn)).toEqual(
      monthly.sums.map((one) => one.dueOn)
    );
    expect(
      full.cattlePaidMoney +
        full.sums.reduce((sum, one) => sum + one.paidMoney, 0)
    ).toBe(full.paidMoney);
  });

  it("preserves the last whole-taka remainder in partially paid schedules", () => {
    const terms = {
      cattlePartMoney: 40_000,
      sums: monthlySumsOf(50_000, {
        cattlePartMoney: 40_000,
        sums: 3,
        firstDueOn: "2071-02-10",
      }),
    };
    const allocation = monthlyPaymentAllocationOf({
      units: 3,
      unitPriceMoney: 50_000,
      monthly: terms,
      paidMoney: 149_999,
      today: "2071-01-05",
    });
    expect(allocation.sums.at(-1)).toMatchObject({
      amountMoney: 10_002,
      paidMoney: 10_001,
      leftMoney: 1,
    });
    expect(allocation.owedMoney).toBe(1);
  });

  it("keeps a partial sum exact to paisa", () => {
    const almost = allocate(57_999.9);
    expect(almost.owedMoney).toBe(0.1);
    expect(almost.sums.at(-1)?.leftMoney).toBe(0.1);
    expect(allocate(57_999.9 + 0.1).owedMoney).toBe(0);
  });
});

describe("what one Agreement is asked for by the end of the month", () => {
  const monthly = {
    cattlePartMoney: 40_000,
    sums: monthlySumsOf(58_000, {
      cattlePartMoney: 40_000,
      sums: 9,
      firstDueOn: "2071-02-10",
    }),
  };
  const askedFor = (paidMoney: number, today: string) =>
    dueByMonthEndOf(
      monthlyPaymentAllocationOf({
        units: 1,
        unitPriceMoney: 58_000,
        monthly,
        paidMoney,
        today,
      }),
      today
    );

  it("asks for the Cattle Part still owed before any sum has come", () => {
    expect(askedFor(0, "2071-01-05")).toBe(40_000);
  });

  it("asks for a sum falling due later in the month, not only one already due", () => {
    expect(askedFor(40_000, "2071-02-05")).toBe(2000);
  });

  it("asks for what is left of a sum part-paid, and this month's besides", () => {
    expect(askedFor(41_000, "2071-03-03")).toBe(3000);
  });

  it("asks for nothing when this month's sum was sent ahead", () => {
    expect(askedFor(44_000, "2071-02-20")).toBe(0);
  });
});
