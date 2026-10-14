import { describe, expect, it } from "vitest";

import type { StockLine } from "./feed-types";
import { valueOf } from "./feed-types";

/** A store line as the farm answers it, with only what the worth is read from. */
const line = (said: Partial<StockLine>): StockLine =>
  ({
    onHand: 0,
    averagePriceMoney: null,
    ...said,
  }) as StockLine;

describe("what a line of the store is worth", () => {
  it("is the farm's own figure, not what is on hand times the price rounded to the paisa", () => {
    // 6,388.5 kg at ৳372,700 is ৳58.3392… a kilo, which reads 58.34: times six tonnes, ৳4 too much.
    expect(
      valueOf(
        line({ onHand: 6388.5, averagePriceMoney: 58.34, valueMoney: 372_700 })
      )
    ).toBe(372_700);
  });

  it("is on hand times the price on an answer kept from before the farm said its worth", () => {
    const kept = line({ onHand: 100, averagePriceMoney: 40 });
    delete (kept as { valueMoney?: number }).valueMoney;
    expect(valueOf(kept)).toBe(4000);
  });

  it("is nothing said for feed with no price", () => {
    expect(valueOf(line({ onHand: 100, valueMoney: 0 }))).toBeNull();
  });
});
