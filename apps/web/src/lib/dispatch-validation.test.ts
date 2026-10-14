import { describe, expect, it } from "vitest";

import { dispatchMoneySent, dispatchProblem } from "./dispatch-validation";
import { NO_RECEIVABLE } from "./receivable";

const form = { liters: "20", price: "50", buyerName: "Buyer" };
describe("milk dispatch validation", () => {
  it("points zero and non-finite quantities and prices to their own fields", () => {
    for (const liters of ["", "0", "-1", "Infinity", "bad"]) {
      expect(
        dispatchProblem({ ...form, liters }, NO_RECEIVABLE, 1000)?.at
      ).toBe("dispatch-liters");
    }
    expect(dispatchProblem({ ...form, price: "0" }, NO_RECEIVABLE, 0)?.at).toBe(
      "dispatch-price"
    );
    expect(
      dispatchProblem({ ...form, buyerName: " " }, NO_RECEIVABLE, 1000)?.at
    ).toBe("dispatch-buyerName");
  });
  it("allows full payment and zero paid on credit but explains payment above the invoice total", () => {
    expect(dispatchProblem(form, NO_RECEIVABLE, 1000)).toBeNull();
    expect(
      dispatchProblem(form, { owed: true, paidNow: "0", promisedBy: "" }, 1000)
    ).toBeNull();
    expect(
      dispatchProblem(
        form,
        { owed: true, paidNow: "1001", promisedBy: "" },
        1000
      )?.at
    ).toBe("dispatch-receivable-paid-now");
  });
  it("asks no price and nothing of the money for milk whose price is to follow, but still its liters and buyer", () => {
    const toFollow = { ...form, price: "" };

    expect(dispatchProblem(toFollow, NO_RECEIVABLE, 0, true)).toBeNull();
    expect(
      dispatchProblem({ ...toFollow, liters: "" }, NO_RECEIVABLE, 0, true)?.at
    ).toBe("dispatch-liters");
    expect(
      dispatchProblem({ ...toFollow, buyerName: "" }, NO_RECEIVABLE, 0, true)
        ?.at
    ).toBe("dispatch-buyerName");
  });
});

describe("the money a Dispatch is sent with", () => {
  it("is its price and what was paid, or only that its price is to follow", () => {
    expect(
      dispatchMoneySent({
        price: "58",
        priceToFollow: false,
        receivable: { owed: true, paidNow: "100", promisedBy: "" },
      })
    ).toEqual({ pricePerLiterMoney: 58, paidNowMoney: 100 });
    expect(
      dispatchMoneySent({
        price: "58",
        priceToFollow: true,
        receivable: { owed: true, paidNow: "0", promisedBy: "" },
      })
    ).toEqual({ priceToFollow: true });
  });
});
