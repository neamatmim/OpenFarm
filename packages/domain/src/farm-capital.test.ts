import { describe, expect, it } from "vitest";

import { farmsOwnPayout } from "./farm-capital";

// What the Farm's own Units bring back at Settlement, as the Farm's books read it: its capital coming home, and — where
// the run made money — its share of the profit on that capital as income. A loss comes back as capital short.

describe("what the Farm's own Units bring back", () => {
  it("is its capital back and the rest its return, where the run made money", () => {
    expect(
      farmsOwnPayout({ capitalMoney: 100_000, payoutMoney: 112_500 })
    ).toEqual({ capitalBackMoney: 100_000, returnMoney: 12_500 });
  });

  it("is capital back short, and no return, where the run lost", () => {
    expect(
      farmsOwnPayout({ capitalMoney: 100_000, payoutMoney: 91_000 })
    ).toEqual({ capitalBackMoney: 91_000, returnMoney: 0 });
  });

  it("is its capital exactly, where the run broke even", () => {
    expect(
      farmsOwnPayout({ capitalMoney: 100_000, payoutMoney: 100_000 })
    ).toEqual({ capitalBackMoney: 100_000, returnMoney: 0 });
  });
});
