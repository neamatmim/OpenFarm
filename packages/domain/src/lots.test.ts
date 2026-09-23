import { describe, expect, it } from "vitest";

import {
  expiryStanding,
  expiryWindow,
  leftOfEachLot,
  runsLow,
  storeOfLots,
} from "./lots";

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

/** The farm's day 1 June 2038, warning thirty days ahead: 1 June to 1 July. */
const JUNE = expiryWindow(new Date("2038-06-01T04:00:00.000Z"), 30);

describe("where a Lot stands against its day", () => {
  it("reads the farm's own day, not the machine's", () => {
    // Half past midnight on 1 June in Dhaka, when a clock kept in UTC still says 31 May: the window is the farm's.
    expect(expiryWindow(new Date("2038-05-31T18:30:00.000Z"), 30)).toEqual({
      today: "2038-06-01",
      warnUntil: "2038-07-01",
    });
  });

  it("may still be used on its last day, and is expired the day after", () => {
    expect(expiryStanding("2038-06-01", JUNE)).toBe("soon");
    expect(expiryStanding("2038-05-31", JUNE)).toBe("expired");
  });

  it("is going off within the farm's warning, and fine beyond it", () => {
    expect(expiryStanding("2038-07-01", JUNE)).toBe("soon");
    expect(expiryStanding("2038-07-02", JUNE)).toBe("fine");
    // The same Lot on a farm that warns sixty days ahead.
    const sixty = expiryWindow(new Date("2038-06-01T04:00:00.000Z"), 60);
    expect(expiryStanding("2038-07-02", sixty)).toBe("soon");
  });

  it("stands nowhere with no day printed", () => {
    expect(expiryStanding(null, JUNE)).toBe("none");
  });
});

describe("a store of Lots", () => {
  const withNumber = (
    id: string,
    quantity: number,
    expiresOn: string | null
  ) => ({ ...lot(id, quantity, expiresOn, "2038-01-01"), lotNumber: id });

  it("says what is left of each Lot, where each stands, and which to reach for next", () => {
    const store = storeOfLots(
      [
        withNumber("late", 10, "2039-01-01"),
        withNumber("gone-off", 10, "2038-05-20"),
        withNumber("soon", 10, "2038-06-20"),
      ],
      12,
      JUNE
    );
    expect(store.lots).toEqual([
      expect.objectContaining({ id: "gone-off", left: 0, standing: "expired" }),
      expect.objectContaining({ id: "soon", left: 8, standing: "soon" }),
      expect.objectContaining({ id: "late", left: 10, standing: "fine" }),
    ]);
    // The expired Lot is empty, so the next to reach for is the one going off soon, and nothing is past its day.
    expect(store.next).toMatchObject({ lotNumber: "soon", left: 8 });
    expect(store.pastItsDay).toBe(0);
  });

  it("counts what is still on the shelf past its day", () => {
    const store = storeOfLots(
      [withNumber("gone-off", 10, "2038-05-20"), withNumber("fine", 5, null)],
      3,
      JUNE
    );
    expect(store.pastItsDay).toBe(7);
    expect(store.next).toMatchObject({ id: "gone-off", standing: "expired" });
  });

  it("has nothing to reach for when no Lot with something left has a day", () => {
    const store = storeOfLots(
      [withNumber("used-up", 4, "2038-06-10"), withNumber("undated", 6, null)],
      4,
      JUNE
    );
    expect(store.next).toBeNull();
    expect(store.lots.map((one) => one.standing)).toEqual(["soon", "none"]);
  });
});

describe("a store running low", () => {
  it("is under the level the farm set, for one still kept", () => {
    expect(runsLow({ onHand: 4, level: 10, retired: false })).toBe(true);
    expect(runsLow({ onHand: 10, level: 10, retired: false })).toBe(false);
  });

  it("is never low when nobody watches it, or when it is retired", () => {
    expect(runsLow({ onHand: 0, level: null, retired: false })).toBe(false);
    expect(runsLow({ onHand: 0, level: 10, retired: true })).toBe(false);
  });
});
