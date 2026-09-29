import { describe, expect, it } from "vitest";

import { bakiAtTheGate, bakiPutRight, paidAtTheGate } from "./baki";

const LEFT_ON = "2026-06-16";

const atTheGate = (more: Partial<Parameters<typeof bakiAtTheGate>[0]> = {}) =>
  bakiAtTheGate({
    worthBdt: 120_000,
    leftOn: LEFT_ON,
    promiseRequired: true,
    ...more,
  });

describe("Baki at the gate", () => {
  it("owes nothing when nothing is said of what was paid", () => {
    expect(atTheGate()).toEqual({ bakiBdt: 0, promisedBy: null });
  });

  it("owes the rest of the price, by the day he promised", () => {
    expect(
      atTheGate({ paidNowBdt: 100_000, promisedBy: "2026-06-23" })
    ).toEqual({ bakiBdt: 20_000, promisedBy: "2026-06-23" });
  });

  it("owes all of it when he paid nothing", () => {
    expect(atTheGate({ paidNowBdt: 0, promisedBy: "2026-06-23" })).toEqual({
      bakiBdt: 120_000,
      promisedBy: "2026-06-23",
    });
  });

  it("drops a promise when he paid in full", () => {
    expect(
      atTheGate({ paidNowBdt: 120_000, promisedBy: "2026-06-23" })
    ).toEqual({ bakiBdt: 0, promisedBy: null });
  });

  it("refuses more paid than the price", () => {
    expect(atTheGate({ paidNowBdt: 120_001 })).toEqual({
      refusal: "paid_more_than_price",
    });
  });

  it("refuses a Sale's Baki with no promised day", () => {
    expect(atTheGate({ paidNowBdt: 100_000 })).toEqual({
      refusal: "baki_needs_a_promise",
    });
  });

  it("takes a Dispatch's Baki with no promised day", () => {
    expect(
      atTheGate({ worthBdt: 3150, paidNowBdt: 0, promiseRequired: false })
    ).toEqual({ bakiBdt: 3150, promisedBy: null });
  });

  it("takes a promise to pay the same day it left", () => {
    expect(atTheGate({ paidNowBdt: 0, promisedBy: LEFT_ON })).toEqual({
      bakiBdt: 120_000,
      promisedBy: LEFT_ON,
    });
  });

  it("refuses a promise to pay before it left", () => {
    expect(atTheGate({ paidNowBdt: 0, promisedBy: "2026-06-15" })).toEqual({
      refusal: "promise_before_it_left",
    });
  });

  it("works milk's worth to the poisha", () => {
    // 45.5 litres at 68.3 comes to 3107.65; a float would carry it a hair off.
    expect(
      atTheGate({
        worthBdt: 45.5 * 68.3,
        paidNowBdt: 3000,
        promiseRequired: false,
      })
    ).toEqual({ bakiBdt: 107.65, promisedBy: null });
  });
});

const putRight = (
  before: { worthBdt: number; bakiBdt: number; promisedBy: string | null },
  more: Partial<Parameters<typeof bakiPutRight>[0]> = {}
) =>
  bakiPutRight({
    before,
    worthBdt: before.worthBdt,
    leftOn: LEFT_ON,
    promiseRequired: true,
    ...more,
  });

const PAID_IN_FULL = { worthBdt: 120_000, bakiBdt: 0, promisedBy: null };
const PART_PAID = {
  worthBdt: 120_000,
  bakiBdt: 20_000,
  promisedBy: "2026-06-23",
};

describe("Baki put right", () => {
  it("keeps a buyer who paid in full paid in full at a corrected price", () => {
    expect(putRight(PAID_IN_FULL, { worthBdt: 125_000 })).toEqual({
      bakiBdt: 0,
      promisedBy: null,
    });
  });

  it("keeps what a part-paying buyer paid at a corrected price", () => {
    expect(putRight(PART_PAID, { worthBdt: 125_000 })).toEqual({
      bakiBdt: 25_000,
      promisedBy: "2026-06-23",
    });
  });

  it("takes what he paid when the Correction says it", () => {
    expect(putRight(PART_PAID, { paidNowBdt: 110_000 })).toEqual({
      bakiBdt: 10_000,
      promisedBy: "2026-06-23",
    });
  });

  it("clears the promise when what he paid comes to the price", () => {
    expect(putRight(PART_PAID, { paidNowBdt: 120_000 })).toEqual({
      bakiBdt: 0,
      promisedBy: null,
    });
  });

  it("turns a paid Sale into Baki only with a promise", () => {
    expect(putRight(PAID_IN_FULL, { paidNowBdt: 100_000 })).toEqual({
      refusal: "baki_needs_a_promise",
    });
    expect(
      putRight(PAID_IN_FULL, {
        paidNowBdt: 100_000,
        promisedBy: "2026-06-30",
      })
    ).toEqual({ bakiBdt: 20_000, promisedBy: "2026-06-30" });
  });

  it("refuses a price corrected below what he paid", () => {
    expect(putRight(PART_PAID, { worthBdt: 90_000 })).toEqual({
      refusal: "paid_more_than_price",
    });
  });

  it("moves only the promised day when that is all it says", () => {
    expect(putRight(PART_PAID, { promisedBy: "2026-07-01" })).toEqual({
      bakiBdt: 20_000,
      promisedBy: "2026-07-01",
    });
  });
});

describe("What was paid at the gate", () => {
  it("is what it came to less what was owed", () => {
    expect(paidAtTheGate(3107.65, 107.65)).toBe(3000);
  });
});
