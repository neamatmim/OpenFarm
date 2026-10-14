import { describe, expect, it } from "vitest";

import { sumsByInvestor } from "./sums-to-ring";

describe("this month's Monthly Sums, one line per Investor", () => {
  it("says the worst of what they hold, and asks for all of it together", () => {
    const said = sumsByInvestor([
      { investorId: "karim", standing: "late", dueMoney: 2500 },
      { investorId: "karim", standing: "missed", dueMoney: 5000 },
      { investorId: "rahim", standing: "due", dueMoney: 2500 },
    ]);

    expect(said.get("karim")).toEqual({ standing: "missed", dueMoney: 7500 });
    expect(said.get("rahim")).toEqual({ standing: "due", dueMoney: 2500 });
  });

  it("keeps the worst standing whichever paper comes first", () => {
    const said = sumsByInvestor([
      { investorId: "karim", standing: "missed", dueMoney: 5000 },
      { investorId: "karim", standing: "due", dueMoney: 2500 },
    ]);

    expect(said.get("karim")?.standing).toBe("missed");
  });
});
