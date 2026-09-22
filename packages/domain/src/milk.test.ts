import { describe, expect, it } from "vitest";

import {
  daysInMilk,
  destinationFor,
  lactationView,
  litresTo,
  reconcile,
} from "./milk";

// Where a cow's milk went, and what the tank says about it. The gate below is one of the two mistakes
// the farm cannot afford, so it is asserted from both sides: what it forces, and what it leaves alone.

const at = (dayAndTime: string) => new Date(`2027-${dayAndTime}+06:00`);

describe("where a Milk Record actually goes", () => {
  it("pours a held-back cow's milk away whatever the phone asked for", () => {
    // The phone evaluates the gate from its last sync and may be stale, so the answer is taken out of
    // the person's hands here.
    expect(destinationFor("bulk", true)).toEqual({
      destination: "discard",
      forced: true,
    });
    expect(destinationFor("calves", true)).toEqual({
      destination: "discard",
      forced: true,
    });
  });

  it("does not call it forced when she poured it away herself", () => {
    // Both end in Discard; only one was taken out of her hands, and the litres have to be tellable
    // apart from milk somebody chose to pour away.
    expect(destinationFor("discard", true)).toEqual({
      destination: "discard",
      forced: false,
    });
  });

  it("leaves a clear cow's milk where it was sent", () => {
    for (const asked of ["bulk", "calves", "discard"] as const) {
      expect(destinationFor(asked, false)).toEqual({
        destination: asked,
        forced: false,
      });
    }
  });
});

describe("the tank against the cows", () => {
  it("takes the difference as a share of what the cows account for", () => {
    expect(reconcile(105, 100, 5)).toMatchObject({
      differenceLitres: 5,
      differencePercent: 5,
    });
  });

  it("does not flag a difference exactly at the tolerance", () => {
    expect(reconcile(105, 100, 5).flagged).toBe(false);
    expect(reconcile(106, 100, 5).flagged).toBe(true);
  });

  it("minds a tank that held less just as much as one that held more", () => {
    expect(reconcile(95, 100, 5)).toMatchObject({
      differenceLitres: -5,
      differencePercent: 5,
      flagged: false,
    });
    expect(reconcile(94, 100, 5).flagged).toBe(true);
  });

  it("counts milk in a tank no cow accounts for as entirely unaccounted for", () => {
    expect(reconcile(12, 0, 5)).toMatchObject({
      differenceLitres: 12,
      differencePercent: 100,
      flagged: true,
    });
  });

  it("has nothing to flag when there was nothing either side", () => {
    expect(reconcile(0, 0, 5)).toEqual({
      sumBulkLitres: 0,
      differenceLitres: 0,
      differencePercent: 0,
      flagged: false,
    });
  });

  it("keeps litres and percentages to the two decimals the record keeps", () => {
    expect(reconcile(100.333, 100, 5)).toMatchObject({
      differenceLitres: 0.33,
      differencePercent: 0.33,
    });
  });
});

describe("how long she has been in milk", () => {
  const calved = at("01-10T06:00:00");

  it("counts the day she calved as day nought", () => {
    expect(daysInMilk(calved, calved)).toBe(0);
    expect(daysInMilk(calved, at("01-20T06:00:00"))).toBe(10);
  });

  it("says nothing at all when no Lactation is running", () => {
    // Rather than a misleading nought.
    expect(daysInMilk(null, at("01-20T06:00:00"))).toBe(null);
  });

  it("never counts backwards", () => {
    expect(daysInMilk(calved, at("01-01T06:00:00"))).toBe(0);
  });

  it("is shown only while she is milking", () => {
    const she = { lactationNumber: 3, lactationStartedAt: calved };
    expect(
      lactationView({ ...she, state: "milking" }, at("01-20T06:00:00"))
        .daysInMilk
    ).toBe(10);
    // Dry, and her lactation number and start are still hers — the days are not.
    expect(
      lactationView({ ...she, state: "dry" }, at("01-20T06:00:00"))
    ).toEqual({
      lactationNumber: 3,
      lactationStartedAt: calved,
      daysInMilk: null,
    });
  });
});

describe("what a set of records sent somewhere", () => {
  const records = [
    { litres: "12.50", destination: "bulk" },
    { litres: 7.25, destination: "bulk" },
    { litres: "3.00", destination: "calves" },
    { litres: "1.75", destination: "discard" },
  ];

  it("adds up only the ones that went there", () => {
    expect(litresTo("bulk", records)).toBe(19.75);
    expect(litresTo("calves", records)).toBe(3);
    expect(litresTo("discard", records)).toBe(1.75);
  });

  it("reads the column's own strings as the figures they are", () => {
    // The litres column comes back as a string, and a sum that concatenated them would be silent.
    expect(litresTo("bulk", [{ litres: "12.50", destination: "bulk" }])).toBe(
      12.5
    );
  });

  it("is nought where nothing went", () => {
    expect(litresTo("bulk", [])).toBe(0);
  });
});
