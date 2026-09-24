import { describe, expect, it } from "vitest";

import { roundFeedTarget, sessionKgOf } from "./feed";
import {
  MAUND_KG,
  feedUnitOf,
  mayGoByWeight,
  quantityOfPacks,
} from "./feed-units";

// What a Feed Item is counted in decides how its figures are rounded, whether a Ration may give it by weight, and
// whether it can be bought by the bag or the maund.

describe("a Feed Item's unit", () => {
  it("counts bundles whole, and never rounds a need to none", () => {
    expect(roundFeedTarget(2.6, "bundle")).toBe(3);
    expect(roundFeedTarget(0.2, "bundle")).toBe(1);
    expect(roundFeedTarget(0, "bundle")).toBe(0);
    // Kilos and litres are weighed as before.
    expect(roundFeedTarget(0.034, "kg")).toBe(0.03);
    expect(roundFeedTarget(14.14, "litre")).toBe(14.1);
  });

  it("gives a pen its napier in whole bundles", () => {
    // Two bundles a head, five head, fed three times: 3⅓ a feeding, given as three.
    expect(
      sessionKgOf(
        { feedItemId: "napier", kgPerAnimalPerDay: 2 },
        { animals: 5, weightKg: null },
        3,
        "bundle"
      )
    ).toBe(3);
  });

  it("goes by weight only in kilos or litres", () => {
    expect(mayGoByWeight("kg")).toBe(true);
    expect(mayGoByWeight("litre")).toBe(true);
    expect(mayGoByWeight("bundle")).toBe(false);
  });

  it("reads a unit it no longer keeps as kilos", () => {
    expect(feedUnitOf("litre")).toBe("litre");
    expect(feedUnitOf("KG ")).toBe("kg");
  });
});

describe("feed bought in packs", () => {
  it("turns maunds into kilos", () => {
    expect(
      quantityOfPacks(
        { kind: "maund", count: 2 },
        { unit: "kg", bagSizeKg: null }
      )
    ).toEqual({ quantity: 2 * MAUND_KG });
  });

  it("turns bags into kilos at the weight the farm set for them", () => {
    expect(
      quantityOfPacks({ kind: "bag", count: 10 }, { unit: "kg", bagSizeKg: 50 })
    ).toEqual({ quantity: 500 });
  });

  it("says why it cannot, for a bag of unknown weight or feed not counted in kilos", () => {
    expect(
      quantityOfPacks(
        { kind: "bag", count: 10 },
        { unit: "kg", bagSizeKg: null }
      )
    ).toEqual({ refusal: "bag_size_unknown" });
    expect(
      quantityOfPacks(
        { kind: "maund", count: 1 },
        { unit: "litre", bagSizeKg: null }
      )
    ).toEqual({ refusal: "pack_needs_kg" });
  });
});
