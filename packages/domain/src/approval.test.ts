import { describe, expect, it } from "vitest";

import { approvalOf } from "./money";

const terms = (amountMoney: number) => ({
  amountMoney,
  counterpartyId: "rahim",
  categoryId: "repairs",
});

describe("where money stands with the Owner", () => {
  it("waits over the line, and not at or under it", () => {
    const at = (amountMoney: number) =>
      approvalOf({
        terms: terms(amountMoney),
        thresholdMoney: 20_000,
        enteredByTheOwner: false,
      });
    expect(at(20_001)).toBe("awaiting");
    expect(at(20_000)).toBe("not_needed");
  });

  it("waits for a piece that takes the week's pieces past the line", () => {
    expect(
      approvalOf({
        terms: terms(15_000),
        thresholdMoney: 20_000,
        enteredByTheOwner: false,
        piecesMoney: 15_000,
      })
    ).toBe("awaiting");
    expect(
      approvalOf({
        terms: terms(5000),
        thresholdMoney: 20_000,
        enteredByTheOwner: false,
        piecesMoney: 15_000,
      })
    ).toBe("not_needed");
  });

  it("never asks the Owner about their own money, pieces or not", () => {
    expect(
      approvalOf({
        terms: terms(15_000),
        thresholdMoney: 20_000,
        enteredByTheOwner: true,
        piecesMoney: 45_000,
      })
    ).toBe("not_needed");
  });
});
