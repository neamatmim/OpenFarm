import { describe, expect, it } from "vitest";

import { dispatchProblem } from "./dispatch-validation";
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
});
