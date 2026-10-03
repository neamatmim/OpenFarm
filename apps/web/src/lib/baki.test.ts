import { describe, expect, it } from "vitest";

import {
  NO_BAKI,
  bakiComplete,
  bakiSent,
  somethingPaid,
  stillOwes,
} from "./baki";

const owed = (paidNow: string, promisedBy = "") => ({
  owed: true,
  paidNow,
  promisedBy,
});

describe("Baki on the sheets", () => {
  it("sends nothing of it for a buyer who paid in full", () => {
    expect(bakiSent(NO_BAKI)).toEqual({});
    expect(bakiComplete(NO_BAKI, 120_000, true)).toBe(true);
    expect(somethingPaid(NO_BAKI)).toBe(true);
  });

  it("sends what he paid and the day he promised", () => {
    expect(bakiSent(owed("100000", "2026-06-23"))).toEqual({
      paidNowMoney: 100_000,
      promisedBy: "2026-06-23",
    });
    expect(bakiSent(owed("0"))).toEqual({
      paidNowMoney: 0,
      promisedBy: undefined,
    });
  });

  it("holds Save until what he paid is a figure no more than the price, and a Sale has its day", () => {
    expect(bakiComplete(owed(""), 120_000, false)).toBe(false);
    expect(bakiComplete(owed("120001"), 120_000, false)).toBe(false);
    expect(bakiComplete(owed("100000"), 120_000, true)).toBe(false);
    expect(bakiComplete(owed("100000", "2026-06-23"), 120_000, true)).toBe(
      true
    );
    expect(bakiComplete(owed("0"), 3150, false)).toBe(true);
  });

  it("works out what he still owes as it is typed", () => {
    expect(stillOwes(owed("100000"), 120_000)).toBe(20_000);
    expect(stillOwes(owed("3000"), 3107.65)).toBe(107.65);
    expect(stillOwes(owed(""), 120_000)).toBeNull();
    expect(stillOwes(owed("130000"), 120_000)).toBeNull();
  });

  it("asks how he paid only when he paid something", () => {
    expect(somethingPaid(owed("0"))).toBe(false);
    expect(somethingPaid(owed("500"))).toBe(true);
  });

  it("keeps asking how he paid while what he paid is not yet typed, so the box does not vanish at the tick", () => {
    expect(somethingPaid(owed(""))).toBe(true);
    expect(somethingPaid(owed(" "))).toBe(true);
  });
});
