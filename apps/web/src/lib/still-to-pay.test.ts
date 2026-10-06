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
    expect(owingOn(paper("cancelled", false))).toBeNull();
  });

  it("reads an answer kept from before the farm said whether it takes capital as it did then", () => {
    expect(owingOn(paper("open"))).toMatchObject({ kind: "to_pay" });
  });
});
