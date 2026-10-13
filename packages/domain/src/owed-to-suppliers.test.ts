import { describe, expect, it } from "vitest";

import { invoiceOwingOn, owedToSuppliersByAge } from "./owed-to-suppliers";

// Read at the end of 31 May 2046.
const AS_OF = "2046-05-31";

describe("what one Supplier Invoice still owed at a day's end", () => {
  const invoice = {
    deliveries: [
      // ৳10,000 of feed on the 10th, ৳2,000 of it paid at the gate.
      {
        receivedOn: "2046-05-10",
        priceMoney: 10_000,
        paidAtDeliveryMoney: 2000,
      },
      // A second load on the bill, after the month's end.
      { receivedOn: "2046-06-03", priceMoney: 5000, paidAtDeliveryMoney: 0 },
    ],
    payments: [
      { paidOn: "2046-05-20", amountMoney: 3000 },
      // Paid after the month's end: still owed at it.
      { paidOn: "2046-06-05", amountMoney: 5000 },
    ],
  };

  it("is the feed come by then, less what was paid at the gate and paid on it by then", () => {
    expect(invoiceOwingOn(invoice, AS_OF)).toBe(5000);
  });

  it("counts nothing of a load that had not come, nor a payment not yet made", () => {
    expect(invoiceOwingOn(invoice, "2046-05-09")).toBe(0);
    expect(invoiceOwingOn(invoice, "2046-06-05")).toBe(5000);
  });

  it("adds in paisa, so a bill of odd taka owes exactly what is left", () => {
    expect(
      invoiceOwingOn(
        {
          deliveries: [
            {
              receivedOn: "2046-05-01",
              priceMoney: 0.1,
              paidAtDeliveryMoney: 0,
            },
            {
              receivedOn: "2046-05-01",
              priceMoney: 0.2,
              paidAtDeliveryMoney: 0,
            },
          ],
          payments: [],
        },
        AS_OF
      )
    ).toBe(0.3);
  });
});

/** One bill as the ages read it: its date, the day it was due (its date, unless said), and what it still owed. */
const bill = (invoicedOn: string, owingMoney: number, dueOn = invoicedOn) => ({
  invoicedOn,
  dueOn,
  owingMoney,
});

describe("what the Farm owed its Suppliers, by how long since each bill", () => {
  it("puts each bill still owing in its age by the days since its date: 0–7, 8–15, 16–30, 31–60, over 60", () => {
    const owed = owedToSuppliersByAge(
      [
        bill("2046-05-31", 1000),
        bill("2046-05-24", 2000),
        bill("2046-05-23", 4000),
        bill("2046-05-16", 8000),
        bill("2046-05-01", 16_000),
        bill("2046-04-01", 32_000),
        bill("2046-03-31", 64_000),
        bill("2046-05-30", 0),
      ],
      AS_OF
    );

    expect(owed.owingMoney).toBe(127_000);
    expect(owed.ages).toEqual([
      { age: "0-7", owingMoney: 3000 },
      { age: "8-15", owingMoney: 12_000 },
      { age: "16-30", owingMoney: 16_000 },
      { age: "31-60", owingMoney: 32_000 },
      { age: "over-60", owingMoney: 64_000 },
    ]);
  });

  it("says how much of it is overdue: past the day each bill was due, a bill due that day still not", () => {
    const owed = owedToSuppliersByAge(
      [
        bill("2046-05-01", 5000, "2046-05-30"),
        bill("2046-05-01", 6000, "2046-05-31"),
        bill("2046-05-01", 7000, "2046-06-15"),
      ],
      AS_OF
    );

    expect(owed.overdueMoney).toBe(5000);
    expect(owed.owingMoney).toBe(18_000);
  });
});
