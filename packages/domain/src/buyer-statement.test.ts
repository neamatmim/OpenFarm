import { describe, expect, it } from "vitest";

import {
  isPriceToFollowOverdue,
  litersCompared,
  priceToFollowOverdueFrom,
  spreadByLiters,
  statementPeriodDays,
} from "./buyer-statement";

describe("a Buyer Statement's money spread over the milk it prices", () => {
  it("gives each Dispatch its liters' share, to the paisa", () => {
    const spread = spreadByLiters(1000, [
      { id: "a", liters: 30 },
      { id: "b", liters: 70 },
    ]);

    expect(spread).toEqual(
      new Map([
        ["a", 300],
        ["b", 700],
      ])
    );
  });

  it("places the paisa left over where the share lost most, the earlier Dispatch first on a tie", () => {
    // 100 taka over three equal cans: 33.333… each; one paisa is left, and it goes to the first.
    const even = spreadByLiters(100, [
      { id: "first", liters: 10 },
      { id: "second", liters: 10 },
      { id: "third", liters: 10 },
    ]);

    expect(even).toEqual(
      new Map([
        ["first", 33.34],
        ["second", 33.33],
        ["third", 33.33],
      ])
    );

    // 10 taka over 1, 2 and 3 liters: 1.6666…, 3.3333…, 5 — the first lost the most.
    const uneven = spreadByLiters(10, [
      { id: "one", liters: 1 },
      { id: "two", liters: 2 },
      { id: "three", liters: 3 },
    ]);

    expect(uneven).toEqual(
      new Map([
        ["one", 1.67],
        ["two", 3.33],
        ["three", 5],
      ])
    );
  });

  it("adds up to the whole, however many cans and however odd the liters", () => {
    const cans = Array.from({ length: 29 }, (_, at) => ({
      id: `can-${at}`,
      liters: 12.37 + at * 0.41,
    }));
    const spread = spreadByLiters(48_311.07, cans);
    const paisa = [...spread.values()].reduce(
      (sum, one) => sum + Math.round(one * 100),
      0
    );

    expect(paisa).toBe(4_831_107);
  });

  it("spreads a lakh over a tanker's liters without losing a paisa to the float", () => {
    const spread = spreadByLiters(99_999_999.99, [
      { id: "tanker", liters: 99_999.99 },
      { id: "can", liters: 0.01 },
    ]);

    expect(spread.get("tanker")).toBe(99_999_989.99);
    expect(spread.get("can")).toBe(10);
  });

  it("spreads nothing over no milk", () => {
    expect(spreadByLiters(500, [])).toEqual(new Map());
  });
});

describe("the buyer's liters beside the farm's", () => {
  it("says how many liters the buyer counted short, and what part of the farm's that is", () => {
    expect(litersCompared({ statedLiters: 970, farmLiters: 1000 })).toEqual({
      differenceLiters: -30,
      differencePercent: -3,
    });
  });

  it("says more counted than the farm sent as more", () => {
    expect(litersCompared({ statedLiters: 412.5, farmLiters: 400 })).toEqual({
      differenceLiters: 12.5,
      differencePercent: 3.13,
    });
  });

  it("gives no percent where the farm sent nothing in the period", () => {
    expect(litersCompared({ statedLiters: 50, farmLiters: 0 })).toEqual({
      differenceLiters: 50,
      differencePercent: null,
    });
  });
});

describe("milk whose price is to follow, left too long", () => {
  it("counts a statement's period from its first day to its last", () => {
    expect(statementPeriodDays("2026-09-01", "2026-09-15")).toBe(15);
    expect(statementPeriodDays("2026-09-01", "2026-09-30")).toBe(30);
  });

  it("is late once the buyer's period and ten days more have gone by", () => {
    expect(priceToFollowOverdueFrom("2026-09-01", 15)).toBe("2026-09-26");
    expect(isPriceToFollowOverdue("2026-09-01", "2026-09-25", 15)).toBe(false);
    expect(isPriceToFollowOverdue("2026-09-01", "2026-09-26", 15)).toBe(true);
  });

  it("allows a month for a buyer who has sent no statement yet", () => {
    expect(priceToFollowOverdueFrom("2026-09-01", null)).toBe("2026-10-12");
  });
});
