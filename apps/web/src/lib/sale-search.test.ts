import { describe, expect, it } from "vitest";

import { saleSearchOf, wasTheTripTab } from "./sale-search";

describe("the Sales page's address", () => {
  it("keeps the day the sold list was looked at, so yesterday's receipt is found without her tag", () => {
    expect(saleSearchOf({ tab: "sold", day: "2026-10-12" })).toEqual({
      tab: "sold",
      day: "2026-10-12",
    });
  });

  it("drops a day that is not one, and so shows today", () => {
    expect(saleSearchOf({ tab: "sold", day: "yesterday" })).toEqual({
      tab: "sold",
    });
    expect(saleSearchOf({ tab: "sold", day: "2026-13-40" })).toEqual({
      tab: "sold",
    });
  });

  it("reads a day still to come as today: nothing has been sold on it yet", () => {
    expect(
      saleSearchOf({ tab: "sold", day: "2026-10-15" }, "2026-10-14")
    ).toEqual({ tab: "sold" });
  });

  it("keeps which animal another page sent here to sell", () => {
    expect(saleSearchOf({ sell: "F-0007" })).toEqual({ sell: "F-0007" });
  });

  it("has no Selling Trip tab any more: an old address for one is sent to the Trips page", () => {
    expect(saleSearchOf({ tab: "trip" })).toEqual({});
    expect(wasTheTripTab({ tab: "trip" })).toBe(true);
    expect(wasTheTripTab({ tab: "sold" })).toBe(false);
  });
});
