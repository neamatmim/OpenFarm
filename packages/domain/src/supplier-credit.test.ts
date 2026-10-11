import { describe, expect, it } from "vitest";

import {
  supplierAging,
  supplierBalance,
  supplierPaymentsFit,
} from "./supplier-credit";

describe("supplier credit", () => {
  it("keeps exact paisa, legacy paid purchases and subsequent payments separate", () => {
    expect(
      supplierBalance(
        [
          { priceMoney: 20_000, paidAtDeliveryMoney: 5000 },
          { priceMoney: 0.3, paidAtDeliveryMoney: null },
        ],
        [{ amountMoney: 0.1 }, { amountMoney: 0.2 }]
      )
    ).toEqual({
      purchasedMoney: 20_000.3,
      paidMoney: 5000.6,
      owingMoney: 14_999.7,
    });
  });
  it("ages from the farm calendar with inclusive overdue boundaries", () => {
    expect(supplierAging("2070-01-01", "2070-01-01")).toBe("current");
    expect(supplierAging("2070-01-01", "2070-01-31")).toBe("1_30");
    expect(supplierAging("2070-01-01", "2070-02-01")).toBe("31_60");
    expect(supplierAging("2070-01-01", "2070-03-03")).toBe("61_90");
    expect(supplierAging("2070-01-01", "2070-04-02")).toBe("over_90");
  });
  it("refuses paying before deliveries, including corrections moving a receipt later", () => {
    const deliveries = [
      { receivedOn: "2070-01-02", priceMoney: 100, paidAtDeliveryMoney: 0 },
    ];
    expect(
      supplierPaymentsFit(deliveries, [
        { paidOn: "2070-01-01", amountMoney: 100 },
      ])
    ).toBe(false);
    expect(
      supplierPaymentsFit(deliveries, [
        { paidOn: "2070-01-02", amountMoney: 100 },
      ])
    ).toBe(true);
    expect(
      supplierPaymentsFit(deliveries, [
        { paidOn: "2070-01-02", amountMoney: 100.01 },
      ])
    ).toBe(false);
  });
});
