import type { VentureState } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { owingOn } from "./still-to-pay";

// What an Investor still owes on a paper is what the farm will still take: once its Venture takes no more capital, a
// sum not sent is not owed — said as not paid, their share by what they paid, never as a sum to pay with no way to pay it.

const paper = (
  state: VentureState,
  takesCapital?: boolean,
  capitalHeldMoney = 50_000
) => ({
  promisedMoney: 100_000,
  capitalHeldMoney,
  venture: { state, takesCapital },
});

describe("what a paper still owes", () => {
  it("is to pay while its Venture takes capital", () => {
    expect(owingOn(paper("open", true))).toEqual({
      kind: "to_pay",
      amountMoney: 50_000,
    });
  });

  it("is not paid, and nothing to pay, once it takes no more", () => {
    expect(owingOn(paper("buying", false))).toEqual({
      kind: "not_paid",
      amountMoney: 50_000,
    });
  });

  it("is nothing once it is all in, or the Venture has ended", () => {
    expect(owingOn(paper("open", true, 100_000))).toBeNull();
    expect(owingOn(paper("settled", false))).toBeNull();
    expect(owingOn(paper("canceled", false))).toBeNull();
  });

  it("reads an answer kept from before the farm said whether it takes capital as it did then", () => {
    expect(owingOn(paper("open"))).toMatchObject({ kind: "to_pay" });
  });
});

// Paid by the month, the rest of the price is not owed today: only the Monthly Sums fallen due are. An Investor who had
// paid every one read "still to pay" for the whole rest of the price on their home, and rang the farm.
const byTheMonth = (
  monthly: {
    dueMoney: number;
    missedMoney: number;
    next: { dueOn: string; amount: number } | null;
  } | null,
  takesCapital = true
) => ({
  ...paper("fattening", takesCapital, 40_000),
  monthly,
});

describe("what a paper paid by the month says is due", () => {
  it("is nothing while every Monthly Sum fallen due is paid, however much of the price is still to come", () => {
    expect(
      owingOn(
        byTheMonth({
          dueMoney: 0,
          missedMoney: 0,
          next: { dueOn: "2088-02-10", amount: 6000 },
        })
      )
    ).toBeNull();
  });

  it("is what has fallen due, with what of it is missed and the next sum after", () => {
    expect(
      owingOn(
        byTheMonth({
          dueMoney: 12_000,
          missedMoney: 6000,
          next: { dueOn: "2088-04-10", amount: 6000 },
        })
      )
    ).toEqual({
      kind: "due",
      amountMoney: 12_000,
      missedMoney: 6000,
      next: { dueOn: "2088-04-10", amount: 6000 },
    });
  });

  it("is not paid, as before, once the Venture takes no more", () => {
    expect(owingOn(byTheMonth(null, false))).toEqual({
      kind: "not_paid",
      amountMoney: 60_000,
    });
  });

  it("is the whole sum still to pay for a Venture paid before buying, as before", () => {
    expect(owingOn({ ...paper("open", true), monthly: null })).toEqual({
      kind: "to_pay",
      amountMoney: 50_000,
    });
  });
});
