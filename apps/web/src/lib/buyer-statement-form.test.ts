import { describe, expect, it } from "vitest";

import {
  STATEMENT_OPENS,
  besideAsked,
  statementProblem,
  statementSent,
} from "./buyer-statement-form";

const typed = {
  ...STATEMENT_OPENS,
  counterpartyId: "buyer-1",
  fromDay: "2026-09-01",
  toDay: "2026-09-15",
  statedOn: "2026-09-17",
  liters: "1480.5",
  amount: "88830",
};

describe("a buyer's statement as it is typed", () => {
  it("asks for the buyer, his days in order, his liters and his amount, each at its own box", () => {
    expect(statementProblem(typed)).toBeNull();
    expect(statementProblem({ ...typed, counterpartyId: "" })?.at).toBe(
      "statement-buyer"
    );
    expect(statementProblem({ ...typed, toDay: "2026-08-31" })?.at).toBe(
      "statement-toDay"
    );
    expect(statementProblem({ ...typed, statedOn: "2026-09-10" })?.at).toBe(
      "statement-statedOn"
    );
    expect(statementProblem({ ...typed, payBy: "2026-09-16" })?.at).toBe(
      "statement-payBy"
    );
    expect(statementProblem({ ...typed, liters: "0" })?.at).toBe(
      "statement-liters"
    );
    expect(statementProblem({ ...typed, amount: "" })?.at).toBe(
      "statement-amount"
    );
  });

  it("is set beside the farm's milk once its buyer, days, liters and amount are typed, and not before", () => {
    expect(besideAsked(typed)).toEqual({
      counterpartyId: "buyer-1",
      fromDay: "2026-09-01",
      toDay: "2026-09-15",
      liters: 1480.5,
      amountMoney: 88_830,
    });
    expect(besideAsked({ ...typed, amount: "" })).toBeNull();
  });

  it("is sent with what was typed, the boxes left empty left out", () => {
    expect(
      statementSent({ ...typed, number: " MV-12 ", fat: "4.1" }, "id-1", null)
    ).toEqual({
      id: "id-1",
      counterpartyId: "buyer-1",
      number: "MV-12",
      fromDay: "2026-09-01",
      toDay: "2026-09-15",
      statedOn: "2026-09-17",
      liters: 1480.5,
      amountMoney: 88_830,
      fatPercent: 4.1,
    });
  });
});
