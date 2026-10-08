import { describe, expect, it } from "vitest";

import {
  findWithdrawalProblems,
  holdInForce,
  illAgainOf,
  MAX_WITHDRAWAL_DAYS,
  daysOfADoseNotPrescribed,
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

/** A Diagnosis of one animal on a day. */
const diagnosedOn = (animalId: string, day: string, disease = "কাশি") => ({
  animalId,
  disease,
  diagnosedAt: new Date(`${day}T00:00:00.000Z`),
});

describe("ill again and again", () => {
  const farm = { illAgainDiagnoses: 3, illAgainDays: 365 };
  const now = new Date("2030-06-01T00:00:00.000Z");
  const on = diagnosedOn;

  it("names an animal diagnosed the farm's number of times within its days, with the latest", () => {
    expect(
      illAgainOf(
        [
          on("a", "2030-01-01"),
          on("a", "2030-05-01", "নিউমোনিয়া"),
          on("a", "2030-03-01"),
        ],
        now,
        farm
      )
    ).toEqual([
      {
        animalId: "a",
        diagnoses: 3,
        lastDisease: "নিউমোনিয়া",
        lastAt: new Date("2030-05-01T00:00:00.000Z"),
      },
    ]);
  });

  it("counts nothing older than the farm's days", () => {
    expect(
      illAgainOf(
        [on("a", "2029-05-01"), on("a", "2030-01-01"), on("a", "2030-03-01")],
        now,
        farm
      )
    ).toEqual([]);
  });

  it("puts the most diagnosed first", () => {
    const months = ["2030-01-01", "2030-02-01", "2030-03-01", "2030-04-01"];
    const list = illAgainOf(
      [
        ...months.slice(0, 3).map((day) => on("fewer", day)),
        ...months.map((day) => on("more", day)),
      ],
      now,
      farm
    );
    expect(list.map((one) => one.animalId)).toEqual(["more", "fewer"]);
  });
});

describe("the days a dose not prescribed keeps", () => {
  const byDefault = { milkDays: 7, meatDays: 28 };

  it("keeps nothing of its own for a product with both days: the Drug List says them", () => {
    expect(
      daysOfADoseNotPrescribed(
        { milkWithdrawalDays: 4, meatWithdrawalDays: 21 },
        byDefault
      )
    ).toEqual({ milkWithdrawalDays: null, meatWithdrawalDays: null });
  });

  it("keeps the Vet's default for each day the product lacks", () => {
    expect(
      daysOfADoseNotPrescribed(
        { milkWithdrawalDays: 4, meatWithdrawalDays: null },
        byDefault
      )
    ).toEqual({ milkWithdrawalDays: null, meatWithdrawalDays: 28 });
  });

  it("is nothing where neither the product nor the Vet's default says a day", () => {
    expect(
      daysOfADoseNotPrescribed(
        { milkWithdrawalDays: null, meatWithdrawalDays: 21 },
        { milkDays: null, meatDays: 28 }
      )
    ).toBeNull();
  });
});

const on = (day: string) => new Date(`2032-10-${day}T02:00:00.000Z`);

describe("the hold in force, with a Vet's shortening", () => {
  const long = { until: on("29"), learnedAt: on("01") };
  const shortening = { at: on("06"), to: on("07") };

  it("is the latest dose's end where the Vet has shortened nothing", () => {
    expect(
      holdInForce([long, { until: on("13"), learnedAt: on("06") }], null)
    ).toEqual({
      until: on("29"),
      shortened: false,
    });
  });

  it("caps the doses the Vet knew of, and adds a dose learned of afterwards on its own days", () => {
    const after = {
      until: on("13"),
      learnedAt: new Date("2032-10-06T03:00:00.000Z"),
    };
    expect(holdInForce([long, after], shortening)).toEqual({
      until: on("13"),
      shortened: true,
    });
  });

  it("stands when a dose it covered is taken away", () => {
    expect(holdInForce([long], shortening)).toEqual({
      until: on("07"),
      shortened: true,
    });
  });

  it("no longer counts once a newer dose holds her longer than all it covered", () => {
    expect(
      holdInForce(
        [
          { until: on("10"), learnedAt: on("01") },
          { until: on("20"), learnedAt: on("08") },
        ],
        shortening
      )
    ).toEqual({ until: on("20"), shortened: false });
  });
});
