import { describe, expect, it } from "vitest";

import { leftOfEachLot } from "./lots";

// What is left of each Lot in the store, worked out rather than counted: everything used is taken from the Lot that
// expires first, as a careful storeman would reach for it. A Lot with no day printed is reached for last.

const lot = (
  id: string,
  quantity: number,
  expiresOn: string | null,
  cameInOn: string
) => ({
  id,
  quantity,
  expiresOn,
  cameInOn,
});

describe("what is left of each Lot", () => {
  it("takes what was used from the Lot that expires first", () => {
    const left = leftOfEachLot(
      [
        lot("late", 10, "2039-12-31", "2038-01-01"),
        lot("early", 10, "2038-06-30", "2038-02-01"),
      ],
      12
    );
    expect(left).toEqual([
      { id: "early", left: 0 },
      { id: "late", left: 8 },
    ]);
  });

  it("reaches for a Lot with no expiry last, and the older of two such first", () => {
    const left = leftOfEachLot(
      [
        lot("loose-new", 5, null, "2038-03-01"),
        lot("loose-old", 5, null, "2038-01-01"),
        lot("dated", 5, "2040-01-01", "2038-02-01"),
      ],
      7
    );
    expect(left).toEqual([
      { id: "dated", left: 0 },
      { id: "loose-old", left: 3 },
      { id: "loose-new", left: 5 },
    ]);
  });

  it("leaves every Lot whole when nothing was used, and none at all when more was used than came in", () => {
    const lots = [lot("a", 4, "2039-01-01", "2038-01-01")];
    expect(leftOfEachLot(lots, 0)).toEqual([{ id: "a", left: 4 }]);
    // More given than was ever written down as bought: a purchase nobody recorded. Nothing is left, not less than
    // nothing.
    expect(leftOfEachLot(lots, 9)).toEqual([{ id: "a", left: 0 }]);
  });
});
