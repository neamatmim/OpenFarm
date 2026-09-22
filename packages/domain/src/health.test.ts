import { describe, expect, it } from "vitest";

import {
  findWithdrawalProblems,
  MAX_WITHDRAWAL_DAYS,
  mayBePrescribed,
  underMeatWithdrawal,
  whyNotPrescribable,
  withdrawalEndsAt,
  withdrawalView,
} from "./health";
import { underMilkWithdrawal } from "./milk";

// The withdrawal days are the only thing between a treated cow and the bulk tank, so each rule here is
// asserted on its own — including the boundary, which is the whole question for a cow whose withdrawal
// ends during the morning milking.

const at = (dayAndTime: string) => new Date(`2027-${dayAndTime}+06:00`);

const days = { milkWithdrawalDays: 3, meatWithdrawalDays: 28 };

describe("what the farm may prescribe", () => {
  it("lets a product with both withdrawal figures through", () => {
    expect(whyNotPrescribable(days)).toBe(null);
    expect(mayBePrescribed(days)).toBe(true);
  });

  it("refuses a product missing either figure, whichever one it is", () => {
    expect(whyNotPrescribable({ ...days, milkWithdrawalDays: null })).toBe(
      "no_withdrawal_days"
    );
    expect(whyNotPrescribable({ ...days, meatWithdrawalDays: null })).toBe(
      "no_withdrawal_days"
    );
  });

  it("says a retired product is retired, even when its figures are missing too", () => {
    // Both are true of it; the reason shown to a person has to be the one she can act on, and no
    // amount of filling in withdrawal days brings a retired product back.
    expect(
      whyNotPrescribable({
        milkWithdrawalDays: null,
        meatWithdrawalDays: null,
        retiredAt: at("02-01T09:00:00"),
      })
    ).toBe("retired");
  });

  it("treats a product never retired the same however that is written", () => {
    expect(mayBePrescribed({ ...days, retiredAt: null })).toBe(true);
    expect(mayBePrescribed({ ...days, retiredAt: undefined })).toBe(true);
  });
});

describe("the days somebody has entered", () => {
  it("takes none at all, and takes the longest a withdrawal is ever going to be", () => {
    expect(
      findWithdrawalProblems({ milkWithdrawalDays: 0, meatWithdrawalDays: 0 })
    ).toEqual([]);
    expect(
      findWithdrawalProblems({
        milkWithdrawalDays: MAX_WITHDRAWAL_DAYS,
        meatWithdrawalDays: MAX_WITHDRAWAL_DAYS,
      })
    ).toEqual([]);
  });

  it("refuses part days, negative days and a figure past the longest", () => {
    expect(
      findWithdrawalProblems({
        milkWithdrawalDays: 1.5,
        meatWithdrawalDays: 28,
      })
    ).toHaveLength(1);
    expect(
      findWithdrawalProblems({ milkWithdrawalDays: -1, meatWithdrawalDays: 28 })
    ).toHaveLength(1);
    expect(
      findWithdrawalProblems({
        milkWithdrawalDays: 3,
        meatWithdrawalDays: MAX_WITHDRAWAL_DAYS + 1,
      })
    ).toHaveLength(1);
  });

  it("names both when both are wrong, rather than stopping at the first", () => {
    expect(
      findWithdrawalProblems({
        milkWithdrawalDays: -1,
        meatWithdrawalDays: 4000,
      })
    ).toHaveLength(2);
  });
});

describe("when a Withdrawal ends", () => {
  it("is the dose itself plus the product's days, keeping the hour it was given", () => {
    // Not the start of a day: a course cut short and a course finished late end at different moments,
    // which is why the farm works this out from the Treatments and not from the Prescription.
    expect(withdrawalEndsAt(at("03-01T14:30:00"), 3)).toEqual(
      at("03-04T14:30:00")
    );
  });

  it("is the dose itself when the product holds nothing back", () => {
    expect(withdrawalEndsAt(at("03-01T14:30:00"), 0)).toEqual(
      at("03-01T14:30:00")
    );
  });
});

describe("whether she is still held back", () => {
  const until = at("03-04T14:30:00");

  it("holds her a moment before the instant, and lets her go at it", () => {
    // Milk drawn at that instant may go to the tank, and a moment before it may not.
    expect(
      underMeatWithdrawal({ meatWithdrawalUntil: until }, at("03-04T14:29:59"))
    ).toBe(true);
    expect(underMeatWithdrawal({ meatWithdrawalUntil: until }, until)).toBe(
      false
    );
  });

  it("holds nobody when nothing was ever given", () => {
    expect(
      underMeatWithdrawal({ meatWithdrawalUntil: null }, at("03-04T14:30:00"))
    ).toBe(false);
  });

  it("answers the milk question the same way as the meat one", () => {
    // The two are twins that live in different modules, and a farm whose milk rule and meat rule
    // disagreed about the boundary would pour away one and sell the other.
    for (const now of [at("03-04T14:29:59"), until, at("03-05T00:00:00")]) {
      expect(underMilkWithdrawal({ milkWithdrawalUntil: until }, now)).toBe(
        underMeatWithdrawal({ meatWithdrawalUntil: until }, now)
      );
    }
  });
});

describe("both of a cow's Withdrawals, as every screen shows them", () => {
  const clear = {
    milkWithdrawalUntil: null,
    meatWithdrawalUntil: null,
    milkWithdrawalFromDoses: null,
    meatWithdrawalFromDoses: null,
    withdrawalShortenedAt: null,
    withdrawalShortenedReason: null,
  };

  it("says nothing about a shortening that never happened", () => {
    expect(withdrawalView(clear, at("03-04T14:30:00")).shortened).toBe(null);
  });

  it("keeps what her doses alone said, which is the figure a slaughter vet asks about", () => {
    const view = withdrawalView(
      {
        ...clear,
        milkWithdrawalUntil: at("03-02T08:00:00"),
        meatWithdrawalUntil: at("03-10T08:00:00"),
        milkWithdrawalFromDoses: at("03-04T08:00:00"),
        meatWithdrawalFromDoses: at("03-29T08:00:00"),
        withdrawalShortenedAt: at("03-01T17:00:00"),
        withdrawalShortenedReason: "ভুল ডোজ লেখা হয়েছিল",
      },
      at("03-03T08:00:00")
    );
    expect(view.shortened).toEqual({
      at: at("03-01T17:00:00"),
      reason: "ভুল ডোজ লেখা হয়েছিল",
      wasMilkUntil: at("03-04T08:00:00"),
      wasMeatUntil: at("03-29T08:00:00"),
    });
    // Shortened, so her milk is already clear while her meat is not.
    expect(view.underMilkWithdrawal).toBe(false);
    expect(view.underMeatWithdrawal).toBe(true);
  });
});
