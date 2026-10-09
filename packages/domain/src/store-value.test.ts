import { describe, expect, it } from "vitest";

import { storeValueOf } from "./store-value";

describe("what the store held, in taka", () => {
  it("is each feed at its average price and each medicine at its dose price", () => {
    expect(
      storeValueOf({
        feed: [
          { onHand: 1000, averagePriceMoney: 40 },
          { onHand: 250.5, averagePriceMoney: 12 },
        ],
        medicine: [
          { expected: 10, perDoseMoney: 500 },
          { expected: 3, perDoseMoney: 120.5 },
        ],
      })
    ).toEqual({
      feedMoney: 43_006,
      medicineMoney: 5361.5,
      totalMoney: 48_367.5,
      unpriced: 0,
    });
  });

  it("counts a book below nothing as nothing, and says how many held stock at no price", () => {
    expect(
      storeValueOf({
        feed: [
          { onHand: -40, averagePriceMoney: 40 },
          // The farm's own napier, never bought.
          { onHand: 2000, averagePriceMoney: null },
        ],
        medicine: [
          { expected: 0, perDoseMoney: 500 },
          { expected: 4, perDoseMoney: null },
        ],
      })
    ).toEqual({ feedMoney: 0, medicineMoney: 0, totalMoney: 0, unpriced: 2 });
  });
});
