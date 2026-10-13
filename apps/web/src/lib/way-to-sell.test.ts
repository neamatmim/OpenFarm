import { describe, expect, it } from "vitest";

import { skipsThePreSaleCheck, wayToSell } from "./way-to-sell";

describe("the way to sell her", () => {
  it("confirms one being fattened Ready first, so her Pre-sale check is raised", () => {
    expect(wayToSell({ side: "fattening", state: "fattening" })).toBe(
      "confirm_ready"
    );
    expect(
      skipsThePreSaleCheck({ side: "fattening", state: "fattening" })
    ).toBe(true);
  });

  it("sells one already Ready, and a Dairy cull who is never Ready", () => {
    expect(wayToSell({ side: "fattening", state: "ready_for_sale" })).toBe(
      "sell"
    );
    expect(wayToSell({ side: "dairy", state: "dry" })).toBe("sell");
    expect(skipsThePreSaleCheck({ side: "dairy", state: "milking" })).toBe(
      false
    );
  });

  it("offers nothing for a bull in Quarantine or one who has left", () => {
    expect(wayToSell({ side: "fattening", state: "quarantine" })).toBeNull();
    expect(wayToSell({ side: "dairy", state: "sold" })).toBeNull();
  });
});
