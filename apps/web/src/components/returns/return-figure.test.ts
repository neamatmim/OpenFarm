import { describe, expect, it } from "vitest";

import type { DairyRun, Running } from "./return-figure";
import { dairyFigureOf, todayRangeSaid, wordFor, SAID } from "./return-figure";

// A cow is read in two places: a line on the Cull list and the panel on her own page. Each once chose her figure for
// itself, and the panel never learnt the two the line had — a calf gone having cost nothing, and one here with nothing
// spent on her yet — so her own page said nothing at all where the list said what she made or would fetch.

/** A calf born here: nothing paid for her, no milk, nothing charged — everything a figure is made of left at nought. */
const aCalf = (over: Partial<DairyRun>): DairyRun => ({
  animalId: "calf-1",
  tagNumber: "C-1",
  state: "calf",
  damId: null,
  came: "born",
  from: null,
  left: null,
  costMoney: 0,
  milkLitres: 0,
  milkMoney: 0,
  endMoney: null,
  milkPricedEarlier: [],
  resultMoney: null,
  returnOnCost: null,
  worthToday: null,
  running: null,
  gaps: [],
  ...over,
});

describe("a dairy run's figure", () => {
  it("is her result where she has gone having cost nothing, with no share to say", () => {
    const gone = aCalf({
      left: { how: "died", on: new Date("2026-09-01") },
      resultMoney: 0,
    });
    expect(dairyFigureOf(gone)).toEqual({ kind: "result", amount: 0 });
  });

  it("is what a head of her kind would fetch where she is here with nothing spent on her", () => {
    const worth = { lowMoney: 12_000, highMoney: 15_000 };
    expect(dairyFigureOf(aCalf({ worthToday: worth }))).toEqual({
      kind: "worth",
      worth,
    });
  });

  it("is her range while she is here and has cost something, before what a head would fetch", () => {
    const running: Running = {
      soldCostMoney: 0,
      soldResultMoney: 0,
      standingCostMoney: 10_000,
      standingLowMoney: 12_000,
      standingHighMoney: 15_000,
      low: { per100: 20, averageDays: 30, perYear: null },
      high: { per100: 50, averageDays: 30, perYear: null },
    } as Running;
    const run = aCalf({
      costMoney: 10_000,
      running,
      worthToday: { lowMoney: 12_000, highMoney: 15_000 },
    });
    expect(dairyFigureOf(run)).toEqual({ kind: "running", running });
  });

  it("is none, with why, where she cannot be counted", () => {
    const gaps = [{ tagNumber: "C-1", why: "no_head_price" as const }];
    expect(dairyFigureOf(aCalf({ gaps }))).toEqual({ kind: "none", gaps });
  });

  it("reads an answer kept from before the two were said as having neither", () => {
    const kept = aCalf({});
    delete (kept as Partial<DairyRun>).resultMoney;
    delete (kept as Partial<DairyRun>).worthToday;
    expect(dairyFigureOf(kept)).toEqual({ kind: "none", gaps: [] });
  });
});

describe("a gain or a loss", () => {
  it("says nought as a gain", () => {
    expect(wordFor(SAID.result, 0)).toBe("returns.made");
    expect(wordFor(SAID.result, -1)).toBe("returns.lost");
  });

  it("says a settled Venture now below its Settlement as less", () => {
    expect(wordFor(SAID.sinceSettlement, -500)).toBe(
      "returns.sinceSettlementLess"
    );
    expect(wordFor(SAID.sinceSettlement, 500)).toBe(
      "returns.sinceSettlementMore"
    );
  });

  it("says a range across nothing from the loss to the gain, both unsigned", () => {
    const range = {
      low: { per100: -10 },
      high: { per100: 25 },
    } as Running;
    expect(todayRangeSaid(range)).toEqual({
      key: "returns.todayRangeMixed",
      params: { loss: 10, gain: 25 },
    });
  });
});
