import { describe, expect, it } from "vitest";

import { heldNow, shortenAsked } from "./shorten-asked";

// What the Vet asks to shorten: only the hold whose box was changed — a hold left as it stands is not ended for being
// left alone.

const now = new Date("2032-10-06T02:00:00.000Z");
const standing = {
  milk: new Date("2032-10-21T02:00:00.000Z"),
  meat: new Date("2032-10-29T02:00:00.000Z"),
};
// The boxes as they open: each hold where it stands, on the farm's clock (Dhaka, six hours ahead).
const opened = { milk: "2032-10-21T08:00", meat: "2032-10-29T08:00" };

describe("what a shortening asks", () => {
  it("leaves the meat hold alone when only the milk was shortened", () => {
    expect(
      shortenAsked(standing, { ...opened, milk: "2032-10-08T08:00" }, now)
    ).toEqual({ milkUntil: new Date("2032-10-08T02:00:00.000Z") });
  });

  it("ends a hold whose box was emptied", () => {
    expect(shortenAsked(standing, { ...opened, meat: "" }, now)).toEqual({
      meatUntil: null,
    });
  });

  it("asks nothing of a hold already over", () => {
    const over = {
      milk: new Date("2032-10-01T02:00:00.000Z"),
      meat: standing.meat,
    };
    expect(heldNow(over, now)).toEqual({ milk: false, meat: true });
    expect(
      shortenAsked(over, { milk: "", meat: "2032-10-10T08:00" }, now)
    ).toEqual({ meatUntil: new Date("2032-10-10T02:00:00.000Z") });
  });
});
