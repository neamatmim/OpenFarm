import { describe, expect, it } from "vitest";

import {
  isANewName,
  paidNowOf,
  startOfMissingCost,
  startOfMissingWage,
  wagesToSend,
} from "./wage-run";

const row = (
  personId: string,
  over: Partial<{
    wageMoney: number;
    drawsTakenMoney: number;
    drawsLeftMoney: number;
    paid: boolean;
  }> = {}
) => ({
  personId,
  name: personId,
  wageMoney: 10_000,
  side: null,
  drawsTakenMoney: 0,
  drawsLeftMoney: 0,
  paidNowMoney: 10_000,
  paid: false,
  ...over,
});

describe("the month's wages as the sheet sends them", () => {
  it("sends the ticked people, at the wage typed or last month's where nothing was typed, never one already paid", () => {
    const rows = [
      row("rahim"),
      row("karim"),
      row("selim", { paid: true }),
      row("jashim"),
    ];
    expect(
      wagesToSend(rows, {
        ticked: new Set(["rahim", "karim", "selim"]),
        typed: { karim: "10500" },
      })
    ).toEqual([
      { personId: "rahim", amountMoney: 10_000 },
      { personId: "karim", amountMoney: 10_500 },
    ]);
  });

  it("leaves out a wage typed as nothing", () => {
    expect(
      wagesToSend([row("rahim")], {
        ticked: new Set(["rahim"]),
        typed: { rahim: "0" },
      })
    ).toEqual([]);
  });

  it("says what changes hands now, the draws taken off a wage typed afresh", () => {
    const owing = row("rahim", { drawsTakenMoney: 3000, drawsLeftMoney: 1000 });
    expect(paidNowOf(owing, "12000")).toBe(8000);
    expect(paidNowOf(owing, "3000")).toBe(0);
    expect(paidNowOf(owing, "")).toBe(6000);
  });
});

describe("a Monthly Cost not entered, opened", () => {
  it("opens with whom it was paid to and how much, last time", () => {
    expect(
      startOfMissingCost({
        categoryId: "rent",
        last: { counterparty: "বাড়িওয়ালা", amountMoney: 18_000 },
      })
    ).toEqual({ categoryId: "rent", counterparty: "বাড়িওয়ালা", amount: "18000" });
    expect(startOfMissingCost({ categoryId: "rent", last: null })).toEqual({
      categoryId: "rent",
    });
  });

  it("opens a wage with the person, the month and their last wage whole", () => {
    expect(
      startOfMissingWage({
        categoryId: "wages",
        personName: "রহিম",
        month: "2075-05",
        lastWageMoney: 12_000,
      })
    ).toEqual({
      categoryId: "wages",
      counterparty: "রহিম",
      wageMonth: "2075-05",
      amount: "12000",
    });
  });
});

describe("a wage's person", () => {
  it("is new only when nobody paid before or on the farm is written so, whatever the case or the keyboard's letters", () => {
    // Kept with য় as one letter (U+09DF)…
    const known = ["রহিম মিয়া", "Karim"];
    expect(isANewName("karim ", known)).toBe(false);
    // …typed as য and its nukta (U+09AF U+09BC): the same letter.
    expect(isANewName("রহিম মিয়া", known)).toBe(false);
    expect(isANewName("রহিম", known)).toBe(true);
    expect(isANewName("", known)).toBe(false);
  });
});
