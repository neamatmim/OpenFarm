import { describe, expect, it } from "vitest";

import { cashFlowOf, cashPositionOf } from "./cash-position";

describe("what the Farm held of its own money", () => {
  it("is every note in the hands less the Ventures', and each Farm Account's worked-out balance", () => {
    expect(
      cashPositionOf({
        hands: { allMoney: 241_900, venturesMoney: 90_000 },
        accounts: [95_000, 12_500.5],
      })
    ).toEqual({
      inHandsMoney: 241_900,
      venturesInHandsMoney: 90_000,
      farmsInHandsMoney: 151_900,
      inAccountsMoney: 107_500.5,
      accountsNotRead: 0,
      farmsOwnMoney: 259_400.5,
    });
  });

  it("counts an account not yet read once as nothing, and says how many there are", () => {
    expect(
      cashPositionOf({
        hands: { allMoney: 0, venturesMoney: 0 },
        accounts: [null, 40_000, null],
      })
    ).toMatchObject({ inAccountsMoney: 40_000, accountsNotRead: 2 });
  });
});

/** The Farm holding so much of its own, all in a hand. */
const at = (farmsOwnMoney: number) =>
  cashPositionOf({
    hands: { allMoney: farmsOwnMoney, venturesMoney: 0 },
    accounts: [],
  });

describe("the month's cash flow", () => {
  it("goes from where the month began, money in and out, to where it ended, and nothing moved besides", () => {
    expect(
      cashFlowOf(at(300_000), at(243_900), {
        inMoney: 50_000,
        outMoney: 106_100,
      })
    ).toEqual({
      openingMoney: 300_000,
      inMoney: 50_000,
      outMoney: 106_100,
      differenceMoney: 0,
      closingMoney: 243_900,
    });
  });

  it("shows what moved without passing a hand or an account, so the four add up", () => {
    // ৳7,000 came in by mobile money with no Farm Account to land in: in the money, in no hand, in no account.
    expect(
      cashFlowOf(at(300_000), at(243_900), {
        inMoney: 57_000,
        outMoney: 106_100,
      }).differenceMoney
    ).toBe(-7000);
  });
});
