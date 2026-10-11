import { describe, expect, it } from "vitest";

import {
  feedOrderProgress,
  feedQuoteTotal,
  incomingFeedQuantity,
  orderByDay,
} from "./feed-purchasing";

describe("feed purchasing", () => {
  it("rounds fractional-unit quotes exactly at half a paisa", () => {
    expect(feedQuoteTotal(17.3, 10.45)).toBe(180.79);
    expect(feedQuoteTotal(1.1, 14.05)).toBe(15.46);
  });
  it("orders ahead of need across months, including leap years", () => {
    expect(orderByDay("2028-03-02", 5, 2)).toBe("2028-02-24");
    expect(orderByDay("2027-01-02", 3, 2)).toBe("2026-12-28");
    expect(orderByDay("2027-01-02", 0, 0)).toBe("2027-01-02");
  });
  it("uses actual quantities and exact paisa, with a visible corrected overrun", () => {
    expect(
      feedOrderProgress({ quantity: "1.0", budgetMoney: 0.3 }, [
        { quantity: "0.1", priceMoney: 0.1 },
        { quantity: "0.2", priceMoney: 0.2 },
      ])
    ).toEqual({
      received: 0.3,
      remaining: 0.7,
      spentMoney: 0.3,
      budgetLeftMoney: 0,
      overQuantity: false,
      overBudget: false,
    });
    expect(
      feedOrderProgress({ quantity: 100, budgetMoney: 4000 }, [
        { quantity: "101", priceMoney: 4001 },
      ])
    ).toMatchObject({
      remaining: 0,
      budgetLeftMoney: -1,
      overBudget: true,
      overQuantity: true,
    });
  });
  it("counts only placed orders arriving in time, without treating them as stock", () => {
    expect(
      incomingFeedQuantity(
        [
          { state: "requested", deliveryDueOn: "2027-01-01", remaining: 50 },
          { state: "approved", deliveryDueOn: "2027-01-01", remaining: 50 },
          { state: "ordered", deliveryDueOn: "2027-01-05", remaining: 30 },
          { state: "ordered", deliveryDueOn: "2027-01-06", remaining: 20 },
          { state: "cancelled", deliveryDueOn: "2027-01-05", remaining: 40 },
          { state: "ordered", deliveryDueOn: null, remaining: 100 },
          {
            state: "ordered",
            deliveryDueOn: "2027-01-04",
            remaining: 50,
            deliveryLate: true,
          },
          {
            state: "ordered",
            deliveryDueOn: "2027-01-05",
            remaining: 30,
            overBudget: true,
          },
        ],
        "2027-01-05"
      )
    ).toBe(30);
  });
});
