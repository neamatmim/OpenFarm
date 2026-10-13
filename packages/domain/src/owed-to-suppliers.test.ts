import { describe, expect, it } from "vitest";

import { atFarmTime } from "./farm-clock";
import { billsOwingAt, owedToSuppliersByAge } from "./owed-to-suppliers";
import { supplierBalance } from "./supplier-credit";

// Read at the end of 31 May 2046.
const AS_OF = "2046-05-31";

/** A load on a bill, come at a farm time on a farm day. */
const load = (
  day: string,
  priceMoney: number,
  paidAtDeliveryMoney: number,
  time = "10:00"
) => ({ receivedOn: atFarmTime(day, time), priceMoney, paidAtDeliveryMoney });

const theBill = {
  invoicedOn: "2046-05-10",
  dueOn: "2046-05-20",
  deliveries: [
    // ৳10,000 of feed on the 10th, ৳2,000 of it paid at the gate.
    load("2046-05-10", 10_000, 2000),
    // A second load on the bill, after the month's end.
    load("2046-06-03", 5000, 0),
  ],
  payments: [
    { paidOn: "2046-05-20", amountMoney: 3000 },
    // Paid after the month's end: still owed at it.
    { paidOn: "2046-06-05", amountMoney: 5000 },
  ],
};

describe("what each Supplier Invoice still owed at a day's end", () => {
  it("is the feed come by then, less what was paid at the gate and paid on it by then", () => {
    expect(billsOwingAt([theBill], AS_OF)).toEqual([
      { ...theBill, owingMoney: 5000 },
    ]);
  });

  it("counts a load come in the day's last minute, and none come the next day", () => {
    const late = {
      ...theBill,
      deliveries: [
        load("2046-05-31", 1000, 0, "23:59"),
        load("2046-06-01", 2000, 0, "00:00"),
      ],
      payments: [],
    };

    expect(billsOwingAt([late], AS_OF)[0]?.owingMoney).toBe(1000);
  });

  it("leaves out a bill dated after the day, and one paid up by then", () => {
    expect(billsOwingAt([theBill], "2046-05-09")).toEqual([]);
    expect(
      billsOwingAt(
        [
          {
            ...theBill,
            payments: [{ paidOn: "2046-05-20", amountMoney: 8000 }],
          },
        ],
        AS_OF
      )
    ).toEqual([]);
  });

  it("reads a bill as Feed → Suppliers reads its balance, once every load has come and every payment been made", () => {
    const [owing] = billsOwingAt([theBill], "2046-07-01");

    expect(owing?.owingMoney).toBe(
      supplierBalance(theBill.deliveries, theBill.payments).owingMoney
    );
  });
});

/** One bill as the ages read it: its date, the day it was due (its date, unless said), and what it still owed. */
const bill = (invoicedOn: string, owingMoney: number, dueOn = invoicedOn) => ({
  invoicedOn,
  dueOn,
  owingMoney,
});

describe("what the Farm owed its Suppliers, by how long since each bill", () => {
  it("puts each bill in its age by the days since its date: 0–7, 8–15, 16–30, 31–60, over 60", () => {
    const owed = owedToSuppliersByAge(
      [
        bill("2046-05-31", 1000),
        bill("2046-05-24", 2000),
        bill("2046-05-23", 4000),
        bill("2046-05-16", 8000),
        bill("2046-05-01", 16_000),
        bill("2046-04-01", 32_000),
        bill("2046-03-31", 64_000),
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
