import { describe, expect, it } from "vitest";

import { sweptUp } from "./settlement-store";

/**
 * A settled Venture's account should read nothing, and for a while it read ৳০.০১.
 *
 * A month's Reimbursement is the sum of five parts each already rounded, because five lines that do not
 * add up to the figure beneath them is the farm arguing with itself in front of an Investor. A Settlement
 * adds the raw shares over the whole run and rounds once. The two do not agree to the paisa, and what is
 * left over sits in the account for ever.
 *
 * The Owner's decision (2026-09-20) was that the Farm sweeps it, on the line that already carries the
 * other remainder — the taka the per-Unit flooring leaves behind.
 */
const SPLIT = { roundingBdt: 5.64, farmBdt: 81_708.36 };

describe("the remainder a settled account is left holding", () => {
  it("joins the one the flooring already left, and goes to the Farm", () => {
    const swept = sweptUp(SPLIT, 0.01);

    expect(swept.roundingBdt).toBe(5.65);
    expect(swept.farmBdt).toBe(81_708.37);
  });

  it("takes it the other way when the two roundings went the other way", () => {
    // The gap could as easily be the other sign, and then the Farm is a paisa short rather than over.
    const swept = sweptUp(SPLIT, -0.01);

    expect(swept.roundingBdt).toBe(5.63);
    expect(swept.farmBdt).toBe(81_708.35);
  });

  it("leaves a whole taka alone, because that is not rounding", () => {
    // A taka is not paisa drift. Something else is wrong, and a Settlement that quietly moved it would
    // be hiding the thing the Owner has to go and find.
    for (const over of [1, -1, 250, -9001]) {
      expect(sweptUp(SPLIT, over), `${over} was swept`).toEqual(SPLIT);
    }
  });

  it("changes nothing when the account already comes out at nothing", () => {
    expect(sweptUp(SPLIT, 0)).toEqual(SPLIT);
  });
});
