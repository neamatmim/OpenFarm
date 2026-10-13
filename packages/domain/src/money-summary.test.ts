import { describe, expect, it } from "vitest";

import type { MoneyToSummarize } from "./money-summary";
import { summarizeMoney } from "./money-summary";

const money = (
  over: Partial<MoneyToSummarize> &
    Pick<MoneyToSummarize, "direction" | "amountMoney" | "categoryBn">
): MoneyToSummarize => ({
  categoryEn: null,
  counterpartyName: null,
  sides: [{ side: null, amountMoney: over.amountMoney }],
  awaitingApproval: false,
  outsideTheResults: false,
  ...over,
});

// A month's milk ৳60,000 and rent ৳9,000, beside a ৳200,000 loan and a ৳150,000 chopper (ADR 0027).
const MONTH = [
  money({ direction: "in", amountMoney: 60_000, categoryBn: "দুধ বিক্রি" }),
  money({ direction: "out", amountMoney: 9000, categoryBn: "শেড ভাড়া" }),
  money({
    direction: "in",
    amountMoney: 200_000,
    categoryBn: "ঋণ পাওয়া",
    counterpartyName: "সোনালী ব্যাংক",
    outsideTheResults: true,
  }),
  money({
    direction: "out",
    amountMoney: 150_000,
    categoryBn: "যন্ত্র বা ঘর কেনা",
    outsideTheResults: true,
  }),
];

describe("the accountant's summary of a period", () => {
  it("counts money outside the results as neither income nor expense", () => {
    expect(summarizeMoney(MONTH)).toMatchObject({
      incomeMoney: 60_000,
      expenseMoney: 9000,
      netMoney: 51_000,
    });
  });

  it("lists it apart by Category, and in no other way of adding the money", () => {
    const summary = summarizeMoney(MONTH);

    expect(summary.outsideTheResults).toEqual([
      { nameBn: "ঋণ পাওয়া", nameEn: null, inMoney: 200_000, outMoney: 0 },
      { nameBn: "যন্ত্র বা ঘর কেনা", nameEn: null, inMoney: 0, outMoney: 150_000 },
    ]);
    expect(summary.byCategory.map((one) => one.nameBn)).toEqual([
      "দুধ বিক্রি",
      "শেড ভাড়া",
    ]);
    expect(summary.byCounterparty.map((one) => one.name)).not.toContain(
      "সোনালী ব্যাংক"
    );
    expect(summary.bySide).toEqual([
      { side: null, inMoney: 60_000, outMoney: 9000 },
    ]);
  });

  it("still says all the cash that moved", () => {
    expect(summarizeMoney(MONTH).cash).toEqual({
      inMoney: 260_000,
      outMoney: 159_000,
      netMoney: 101_000,
    });
  });
});
