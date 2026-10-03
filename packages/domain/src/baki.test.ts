import { describe, expect, it } from "vitest";

import {
  bakiAtTheGate,
  bakiPutRight,
  bakiStanding,
  isBakiOverdue,
  overdueFrom,
  paidAtTheGate,
  soldOnBakiWhileOverdue,
} from "./baki";

const LEFT_ON = "2026-06-16";

const atTheGate = (more: Partial<Parameters<typeof bakiAtTheGate>[0]> = {}) =>
  bakiAtTheGate({
    worthMoney: 120_000,
    leftOn: LEFT_ON,
    promiseRequired: true,
    ...more,
  });

describe("Baki at the gate", () => {
  it("owes nothing when nothing is said of what was paid", () => {
    expect(atTheGate()).toEqual({ bakiMoney: 0, promisedBy: null });
  });

  it("owes the rest of the price, by the day he promised", () => {
    expect(
      atTheGate({ paidNowMoney: 100_000, promisedBy: "2026-06-23" })
    ).toEqual({ bakiMoney: 20_000, promisedBy: "2026-06-23" });
  });

  it("owes all of it when he paid nothing", () => {
    expect(atTheGate({ paidNowMoney: 0, promisedBy: "2026-06-23" })).toEqual({
      bakiMoney: 120_000,
      promisedBy: "2026-06-23",
    });
  });

  it("drops a promise when he paid in full", () => {
    expect(
      atTheGate({ paidNowMoney: 120_000, promisedBy: "2026-06-23" })
    ).toEqual({ bakiMoney: 0, promisedBy: null });
  });

  it("refuses more paid than the price", () => {
    expect(atTheGate({ paidNowMoney: 120_001 })).toEqual({
      refusal: "paid_more_than_price",
    });
  });

  it("refuses a Sale's Baki with no promised day", () => {
    expect(atTheGate({ paidNowMoney: 100_000 })).toEqual({
      refusal: "baki_needs_a_promise",
    });
  });

  it("takes a Dispatch's Baki with no promised day", () => {
    expect(
      atTheGate({ worthMoney: 3150, paidNowMoney: 0, promiseRequired: false })
    ).toEqual({ bakiMoney: 3150, promisedBy: null });
  });

  it("takes a promise to pay the same day it left", () => {
    expect(atTheGate({ paidNowMoney: 0, promisedBy: LEFT_ON })).toEqual({
      bakiMoney: 120_000,
      promisedBy: LEFT_ON,
    });
  });

  it("refuses a promise to pay before it left", () => {
    expect(atTheGate({ paidNowMoney: 0, promisedBy: "2026-06-15" })).toEqual({
      refusal: "promise_before_it_left",
    });
  });

  it("works milk's worth to the poisha", () => {
    // 45.5 litres at 68.3 comes to 3107.65; a float would carry it a hair off.
    expect(
      atTheGate({
        worthMoney: 45.5 * 68.3,
        paidNowMoney: 3000,
        promiseRequired: false,
      })
    ).toEqual({ bakiMoney: 107.65, promisedBy: null });
  });
});

const putRight = (
  before: { worthMoney: number; bakiMoney: number; promisedBy: string | null },
  more: Partial<Parameters<typeof bakiPutRight>[0]> = {}
) =>
  bakiPutRight({
    before,
    worthMoney: before.worthMoney,
    leftOn: LEFT_ON,
    promiseRequired: true,
    ...more,
  });

const PAID_IN_FULL = { worthMoney: 120_000, bakiMoney: 0, promisedBy: null };
const PART_PAID = {
  worthMoney: 120_000,
  bakiMoney: 20_000,
  promisedBy: "2026-06-23",
};

describe("Baki put right", () => {
  it("keeps a buyer who paid in full paid in full at a corrected price", () => {
    expect(putRight(PAID_IN_FULL, { worthMoney: 125_000 })).toEqual({
      bakiMoney: 0,
      promisedBy: null,
    });
  });

  it("keeps what a part-paying buyer paid at a corrected price", () => {
    expect(putRight(PART_PAID, { worthMoney: 125_000 })).toEqual({
      bakiMoney: 25_000,
      promisedBy: "2026-06-23",
    });
  });

  it("takes what he paid when the Correction says it", () => {
    expect(putRight(PART_PAID, { paidNowMoney: 110_000 })).toEqual({
      bakiMoney: 10_000,
      promisedBy: "2026-06-23",
    });
  });

  it("clears the promise when what he paid comes to the price", () => {
    expect(putRight(PART_PAID, { paidNowMoney: 120_000 })).toEqual({
      bakiMoney: 0,
      promisedBy: null,
    });
  });

  it("turns a paid Sale into Baki only with a promise", () => {
    expect(putRight(PAID_IN_FULL, { paidNowMoney: 100_000 })).toEqual({
      refusal: "baki_needs_a_promise",
    });
    expect(
      putRight(PAID_IN_FULL, {
        paidNowMoney: 100_000,
        promisedBy: "2026-06-30",
      })
    ).toEqual({ bakiMoney: 20_000, promisedBy: "2026-06-30" });
  });

  it("refuses a price corrected below what he paid", () => {
    expect(putRight(PART_PAID, { worthMoney: 90_000 })).toEqual({
      refusal: "paid_more_than_price",
    });
  });

  it("moves only the promised day when that is all it says", () => {
    expect(putRight(PART_PAID, { promisedBy: "2026-07-01" })).toEqual({
      bakiMoney: 20_000,
      promisedBy: "2026-07-01",
    });
  });
});

describe("What was paid at the gate", () => {
  it("is what it came to less what was owed", () => {
    expect(paidAtTheGate(3107.65, 107.65)).toBe(3000);
  });
});

const item = (
  id: string,
  leftOn: string,
  bakiMoney: number,
  promisedBy: string | null = null
) => ({ id, leftOn, bakiMoney, promisedBy });
const paid = (id: string, paidOn: string, amountMoney: number) => ({
  id,
  paidOn,
  amountMoney,
});

describe("a buyer's Baki, cleared oldest first", () => {
  it("owes all of it before he pays anything", () => {
    const standing = bakiStanding(
      [
        item("b", "2026-06-10", 5000),
        item("a", "2026-06-01", 20_000, "2026-06-08"),
      ],
      []
    );
    expect(standing.owingMoney).toBe(25_000);
    expect(standing.oldestOn).toBe("2026-06-01");
    expect(standing.soonestPromise).toBe("2026-06-08");
    expect(standing.items.map((one) => one.id)).toEqual(["a", "b"]);
  });

  it("clears the oldest first when he pays part", () => {
    const standing = bakiStanding(
      [item("a", "2026-06-01", 20_000), item("b", "2026-06-10", 5000)],
      [paid("p1", "2026-06-12", 12_000)]
    );
    expect(standing.items).toMatchObject([
      { id: "a", paidMoney: 12_000, owingMoney: 8000 },
      { id: "b", paidMoney: 0, owingMoney: 5000 },
    ]);
    expect(standing.owingMoney).toBe(13_000);
    expect(standing.parts).toEqual([
      { paymentId: "p1", itemId: "a", amountMoney: 12_000 },
    ]);
  });

  it("lets one round sum clear several, and says what it cleared", () => {
    const standing = bakiStanding(
      [
        item("d1", "2026-06-01", 1750),
        item("d2", "2026-06-02", 1750),
        item("d3", "2026-06-03", 1750),
      ],
      [paid("p1", "2026-06-05", 4000)]
    );
    expect(standing.parts).toEqual([
      { paymentId: "p1", itemId: "d1", amountMoney: 1750 },
      { paymentId: "p1", itemId: "d2", amountMoney: 1750 },
      { paymentId: "p1", itemId: "d3", amountMoney: 500 },
    ]);
    expect(standing.owingMoney).toBe(1250);
    expect(standing.oldestOn).toBe("2026-06-03");
  });

  it("orders two things left the same day by id, every time", () => {
    const standing = bakiStanding(
      [item("z", "2026-06-01", 1000), item("m", "2026-06-01", 1000)],
      [paid("p1", "2026-06-02", 1000)]
    );
    expect(standing.items.find((one) => one.owingMoney === 0)?.id).toBe("m");
  });

  it("holds what he paid beyond it as credit, and spends it on what he takes next", () => {
    const ahead = bakiStanding(
      [item("a", "2026-06-01", 1000)],
      [paid("p1", "2026-06-02", 1500)]
    );
    expect(ahead).toMatchObject({
      owingMoney: 0,
      creditMoney: 500,
      oldestOn: null,
    });

    const later = bakiStanding(
      [item("a", "2026-06-01", 1000), item("b", "2026-06-05", 800)],
      [paid("p1", "2026-06-02", 1500)]
    );
    expect(later).toMatchObject({ owingMoney: 300, creditMoney: 0 });
  });

  it("reads a Correction that shrank an old Baki below what was paid on it as credit", () => {
    const standing = bakiStanding(
      [item("a", "2026-06-01", 500)],
      [paid("p1", "2026-06-02", 1000)]
    );
    expect(standing).toMatchObject({ owingMoney: 0, creditMoney: 500 });
  });

  it("names no promise for what is already paid", () => {
    const standing = bakiStanding(
      [
        item("a", "2026-06-01", 1000, "2026-06-03"),
        item("b", "2026-06-02", 1000, "2026-06-20"),
      ],
      [paid("p1", "2026-06-02", 1000)]
    );
    expect(standing.soonestPromise).toBe("2026-06-20");
  });
});

const standingItem = (
  id: string,
  leftOn: string,
  owingMoney: number,
  promisedBy: string | null = null
) => ({ id, leftOn, promisedBy, owingMoney });

describe("overdue Baki", () => {
  it("is not late on the day he promised, and is the day after", () => {
    const bull = standingItem("a", "2026-06-01", 20_000, "2026-06-08");
    expect(overdueFrom(bull, 30)).toBe("2026-06-09");
    expect(isBakiOverdue(bull, "2026-06-08", 30)).toBe(false);
    expect(isBakiOverdue(bull, "2026-06-09", 30)).toBe(true);
  });

  it("gives milk with no promise the farm's days, and is late the day after they run out", () => {
    const milk = standingItem("d", "2026-06-01", 1750);
    // Thirty days from the first of June is the first of July: still within them.
    expect(isBakiOverdue(milk, "2026-07-01", 30)).toBe(false);
    expect(isBakiOverdue(milk, "2026-07-02", 30)).toBe(true);
  });

  it("is still overdue when part is paid, and not when all is", () => {
    expect(
      isBakiOverdue(
        standingItem("a", "2026-06-01", 5000, "2026-06-08"),
        "2026-06-20",
        30
      )
    ).toBe(true);
    expect(
      isBakiOverdue(
        standingItem("a", "2026-06-01", 0, "2026-06-08"),
        "2026-06-20",
        30
      )
    ).toBe(false);
  });

  it("counts a promise across the turn of a month", () => {
    const bull = standingItem("a", "2026-01-25", 20_000, "2026-01-31");
    expect(overdueFrom(bull, 30)).toBe("2026-02-01");
  });

  it("says when he was sold to on Baki again while already late", () => {
    const late = standingItem("a", "2026-06-01", 20_000, "2026-06-08");
    const before = standingItem("b", "2026-06-05", 10_000, "2026-06-20");
    const after = standingItem("c", "2026-06-10", 10_000, "2026-06-25");
    expect(soldOnBakiWhileOverdue([late, before], 30)).toBe(false);
    expect(soldOnBakiWhileOverdue([late, after], 30)).toBe(true);
    // Paid off, the late one no longer makes the next a loan to a man who has not paid.
    expect(
      soldOnBakiWhileOverdue([{ ...late, owingMoney: 0 }, after], 30)
    ).toBe(false);
  });
});

const writtenOff = (
  id: string,
  leftOn: string,
  bakiMoney: number,
  writtenOffMoney: number
) => ({ id, leftOn, bakiMoney, promisedBy: null, writtenOffMoney });

describe("Baki written off", () => {
  it("is no longer owed, and says what stays written off", () => {
    const standing = bakiStanding(
      [writtenOff("a", "2026-06-01", 20_000, 20_000)],
      []
    );
    expect(standing).toMatchObject({
      owingMoney: 0,
      writtenOffMoney: 20_000,
      creditMoney: 0,
    });
  });

  it("is paid last: money clears what is open before it puts a write-off back", () => {
    const standing = bakiStanding(
      [
        writtenOff("a", "2026-06-01", 20_000, 20_000),
        item("b", "2026-06-10", 5000),
      ],
      [paid("p1", "2026-06-12", 8000)]
    );
    expect(standing.items).toMatchObject([
      { id: "a", owingMoney: 0, writtenOffMoney: 17_000, paidMoney: 3000 },
      { id: "b", owingMoney: 0, writtenOffMoney: 0, paidMoney: 5000 },
    ]);
    expect(standing.writtenOffMoney).toBe(17_000);
  });

  it("is put back whole by a buyer who pays it all after all, and the rest is credit", () => {
    const standing = bakiStanding(
      [writtenOff("a", "2026-06-01", 20_000, 20_000)],
      [paid("p1", "2026-07-01", 21_000)]
    );
    expect(standing).toMatchObject({ writtenOffMoney: 0, creditMoney: 1000 });
  });

  it("leaves the rest owing when only part was written off", () => {
    const standing = bakiStanding(
      [writtenOff("a", "2026-06-01", 20_000, 5000)],
      [paid("p1", "2026-06-05", 10_000)]
    );
    expect(standing.items[0]).toMatchObject({
      owingMoney: 5000,
      writtenOffMoney: 5000,
      paidMoney: 10_000,
    });
  });
});
