import { describe, expect, it } from "vitest";

import type { MedicineHappening } from "./medicine-store";
import { medicineStoreOf } from "./medicine-store";

// The medicine store, replayed in the order things happened: a count is what was on the shelf, and nothing written
// down afterwards about the days before it moves it.

const at = (day: string) => new Date(`2033-${day}T04:00:00.000Z`);
const window = { today: "2033-12-01", warnUntil: "2033-12-31" };
const bought = (
  id: string,
  day: string,
  doses: number,
  expiresOn: string | null = null
): MedicineHappening => ({
  kind: "bought",
  at: at(day),
  lot: {
    id,
    quantity: doses,
    expiresOn,
    lotNumber: id,
    cameInOn: at(day).toISOString(),
  },
});
const given = (id: string, day: string): MedicineHappening => ({
  kind: "given",
  at: at(day),
  doseId: id,
});
const counted = (day: string, doses: number): MedicineHappening => ({
  kind: "counted",
  at: at(day),
  counted: doses,
});

describe("a product's medicine on the shelf", () => {
  it("is what the last count found, with a dose written down later but given before it not taken twice", () => {
    const store = medicineStoreOf(
      [bought("A", "04-01", 10), counted("04-07", 8), given("d1", "04-05")],
      window
    );
    expect(store.onHand).toBe(8);
  });

  it("is what a later count found, whatever an earlier count is put right to", () => {
    const store = medicineStoreOf(
      [bought("A", "04-01", 10), counted("04-30", 10), counted("05-31", 8)],
      window
    );
    expect(store.onHand).toBe(8);
  });

  it("holds doses a count found over the book", () => {
    const store = medicineStoreOf(
      [bought("A", "04-01", 10), counted("04-30", 12)],
      window
    );
    expect(store.onHand).toBe(12);
    expect(store.countedDifference).toBe(2);
  });

  it("starts again from a count after doses given from a box nobody wrote down", () => {
    const store = medicineStoreOf(
      [
        given("d1", "04-02"),
        given("d2", "04-03"),
        given("d3", "04-04"),
        counted("04-30", 0),
        bought("A", "05-01", 10),
      ],
      window
    );
    expect(store.onHand).toBe(10);
  });

  it("takes a dose from a Lot already bought when it was given, first to expire first", () => {
    const store = medicineStoreOf(
      [
        bought("LONG", "02-02", 10, "2090-01-01"),
        given("d1", "02-10"),
        given("d2", "02-11"),
        given("d3", "02-12"),
        bought("SHORT", "03-01", 10, "2084-12-31"),
      ],
      window
    );
    expect(store.lots.map((one) => [one.id, one.left])).toEqual([
      ["SHORT", 10],
      ["LONG", 7],
    ]);
    expect(store.takenFrom.get("d2")).toBe("LONG");
  });

  it("does not give a dose out of a Lot the count already wrote off", () => {
    const store = medicineStoreOf(
      [
        bought("EARLY", "01-01", 10, "2033-03-31"),
        bought("LATE", "01-01", 10, "2034-03-31"),
        counted("04-07", 10),
        given("d1", "04-10"),
      ],
      window
    );
    expect(store.takenFrom.get("d1")).toBe("LATE");
    expect(store.pastItsDay).toBe(0);
  });
});
