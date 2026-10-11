import { describe, expect, it } from "vitest";

import type { SupplierPlannedInvoice } from "./supplier-payment-plan";
import { supplierPaymentPlan } from "./supplier-payment-plan";

const invoice = (
  id: string,
  dueOn: string,
  owingMoney = 100,
  supplierId = "supplier-a"
): SupplierPlannedInvoice => ({
  id,
  number: id,
  invoicedOn: "2024-01-01",
  dueOn,
  purchasedMoney: 1000,
  paidMoney: 1000 - owingMoney,
  owingMoney,
  supplier: {
    id: supplierId,
    name: supplierId,
    phone: null,
    retired: supplierId === "supplier-b",
  },
});

describe("supplier payment planning", () => {
  it("separates overdue from inclusive seven/thirty day windows and includes overdue in month-end", () => {
    const plan = supplierPaymentPlan(
      [
        invoice("overdue", "2024-02-19"),
        invoice("today", "2024-02-20"),
        invoice("day7", "2024-02-26"),
        invoice("day8", "2024-02-27"),
        invoice("monthEnd", "2024-02-29"),
        invoice("day30", "2024-03-20"),
        invoice("day31", "2024-03-21"),
        invoice("paid", "2024-02-20", 0),
      ],
      "2024-02-20"
    );
    expect(plan).toMatchObject({
      today: "2024-02-20",
      through7: "2024-02-26",
      through30: "2024-03-20",
      monthEnd: "2024-02-29",
      outstandingMoney: 700,
      overdueMoney: 100,
      next7Money: 200,
      next30Money: 500,
      byMonthEndMoney: 500,
    });
    expect(plan.suppliers[0]?.invoices.map((row) => row.id)).toEqual([
      "overdue",
      "today",
      "day7",
      "day8",
      "monthEnd",
      "day30",
      "day31",
    ]);
  });
  it("keeps exact paisa and retired suppliers, sorted by the earliest bill", () => {
    const plan = supplierPaymentPlan(
      [
        invoice("later", "2024-05-10", 0.1),
        invoice("first", "2024-05-01", 0.2, "supplier-b"),
        invoice("sameDay", "2024-05-01", 0.3, "supplier-b"),
      ],
      "2024-05-01"
    );
    expect(plan.outstandingMoney).toBe(0.6);
    expect(plan.suppliers.map((group) => group.supplier.id)).toEqual([
      "supplier-b",
      "supplier-a",
    ]);
    expect(plan.suppliers[0]).toMatchObject({
      supplier: { retired: true },
      outstandingMoney: 0.5,
      next7Money: 0.5,
    });
  });
  it("uses calendar boundaries across years and a non-leap February", () => {
    expect(supplierPaymentPlan([], "2025-02-28")).toMatchObject({
      through7: "2025-03-06",
      through30: "2025-03-29",
      monthEnd: "2025-02-28",
    });
    expect(supplierPaymentPlan([], "2025-12-31")).toMatchObject({
      through7: "2026-01-06",
      through30: "2026-01-29",
      monthEnd: "2025-12-31",
    });
  });
  it("shows no payable when every invoice is paid", () => {
    expect(
      supplierPaymentPlan([invoice("paid", "2024-01-01", 0)], "2024-01-10")
    ).toMatchObject({
      outstandingMoney: 0,
      overdueMoney: 0,
      next7Money: 0,
      next30Money: 0,
      byMonthEndMoney: 0,
      suppliers: [],
    });
  });
});
