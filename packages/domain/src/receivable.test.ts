import { describe, expect, it } from "vitest";

import {
  receivableAtTheGate,
  receivablePutRight,
  receivableStanding,
  isReceivableOverdue,
  overdueFrom,
  paidAtTheGate,
  soldOnCreditWhileOverdue,
} from "./receivable";

const LEFT_ON = "2026-06-16";

const atTheGate = (
  more: Partial<Parameters<typeof receivableAtTheGate>[0]> = {}
) =>
  receivableAtTheGate({
    worthMoney: 120_000,
    leftOn: LEFT_ON,
    promiseRequired: true,
    ...more,
  });

describe("Receivable at the gate", () => {
  it("owes nothing when nothing is said of what was paid", () => {
    expect(atTheGate()).toEqual({ receivableMoney: 0, promisedBy: null });
  });

  it("owes the rest of the price, by the day he promised", () => {
    expect(
      atTheGate({ paidNowMoney: 100_000, promisedBy: "2026-06-23" })
    ).toEqual({ receivableMoney: 20_000, promisedBy: "2026-06-23" });
  });

  it("owes all of it when he paid nothing", () => {
    expect(atTheGate({ paidNowMoney: 0, promisedBy: "2026-06-23" })).toEqual({
      receivableMoney: 120_000,
      promisedBy: "2026-06-23",
    });
  });

  it("drops a promise when he paid in full", () => {
    expect(
      atTheGate({ paidNowMoney: 120_000, promisedBy: "2026-06-23" })
    ).toEqual({ receivableMoney: 0, promisedBy: null });
  });

  it("refuses more paid than the price", () => {
    expect(atTheGate({ paidNowMoney: 120_001 })).toEqual({
      refusal: "paid_more_than_price",
    });
  });

  it("refuses a Sale's Receivable with no promised day", () => {
    expect(atTheGate({ paidNowMoney: 100_000 })).toEqual({
      refusal: "receivable_needs_a_promise",
    });
  });

  it("takes a Dispatch's Receivable with no promised day", () => {
    expect(
      atTheGate({ worthMoney: 3150, paidNowMoney: 0, promiseRequired: false })
    ).toEqual({ receivableMoney: 3150, promisedBy: null });
  });

  it("takes a promise to pay the same day it left", () => {
    expect(atTheGate({ paidNowMoney: 0, promisedBy: LEFT_ON })).toEqual({
      receivableMoney: 120_000,
      promisedBy: LEFT_ON,
    });
  });

  it("refuses a promise to pay before it left", () => {
    expect(atTheGate({ paidNowMoney: 0, promisedBy: "2026-06-15" })).toEqual({
      refusal: "promise_before_it_left",
    });
  });

  it("works milk's worth to the poisha", () => {
    // 45.5 liters at 68.3 comes to 3107.65; a float would carry it a hair off.
    expect(
      atTheGate({
        worthMoney: 45.5 * 68.3,
        paidNowMoney: 3000,
        promiseRequired: false,
      })
    ).toEqual({ receivableMoney: 107.65, promisedBy: null });
  });
});

const putRight = (
  before: {
    worthMoney: number;
    receivableMoney: number;
    promisedBy: string | null;
  },
  more: Partial<Parameters<typeof receivablePutRight>[0]> = {}
) =>
  receivablePutRight({
    before,
    worthMoney: before.worthMoney,
    leftOn: LEFT_ON,
    promiseRequired: true,
    ...more,
  });

const PAID_IN_FULL = {
  worthMoney: 120_000,
  receivableMoney: 0,
  promisedBy: null,
};
const PART_PAID = {
  worthMoney: 120_000,
  receivableMoney: 20_000,
  promisedBy: "2026-06-23",
};

describe("Receivable put right", () => {
  it("keeps a buyer who paid in full paid in full at a corrected price", () => {
    expect(putRight(PAID_IN_FULL, { worthMoney: 125_000 })).toEqual({
      receivableMoney: 0,
      promisedBy: null,
    });
  });

  it("keeps what a part-paying buyer paid at a corrected price", () => {
    expect(putRight(PART_PAID, { worthMoney: 125_000 })).toEqual({
      receivableMoney: 25_000,
      promisedBy: "2026-06-23",
    });
  });

  it("takes what he paid when the Correction says it", () => {
    expect(putRight(PART_PAID, { paidNowMoney: 110_000 })).toEqual({
      receivableMoney: 10_000,
      promisedBy: "2026-06-23",
    });
  });

  it("clears the promise when what he paid comes to the price", () => {
    expect(putRight(PART_PAID, { paidNowMoney: 120_000 })).toEqual({
      receivableMoney: 0,
      promisedBy: null,
    });
  });

  it("turns a paid Sale into Receivable only with a promise", () => {
    expect(putRight(PAID_IN_FULL, { paidNowMoney: 100_000 })).toEqual({
      refusal: "receivable_needs_a_promise",
    });
    expect(
      putRight(PAID_IN_FULL, {
        paidNowMoney: 100_000,
        promisedBy: "2026-06-30",
      })
    ).toEqual({ receivableMoney: 20_000, promisedBy: "2026-06-30" });
  });

  it("refuses a price corrected below what he paid", () => {
    expect(putRight(PART_PAID, { worthMoney: 90_000 })).toEqual({
      refusal: "paid_more_than_price",
    });
  });

  it("moves only the promised day when that is all it says", () => {
    expect(putRight(PART_PAID, { promisedBy: "2026-07-01" })).toEqual({
      receivableMoney: 20_000,
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
  receivableMoney: number,
  promisedBy: string | null = null
) => ({ id, leftOn, receivableMoney, promisedBy });
const paid = (id: string, paidOn: string, amountMoney: number) => ({
  id,
  paidOn,
  amountMoney,
});

describe("a buyer's Receivable, cleared oldest first", () => {
  it("owes all of it before he pays anything", () => {
    const standing = receivableStanding(
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
    const standing = receivableStanding(
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
    const standing = receivableStanding(
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
    const standing = receivableStanding(
      [item("z", "2026-06-01", 1000), item("m", "2026-06-01", 1000)],
      [paid("p1", "2026-06-02", 1000)]
    );
    expect(standing.items.find((one) => one.owingMoney === 0)?.id).toBe("m");
  });

  it("holds what he paid beyond it as paid ahead, and spends it on what he takes next", () => {
    const ahead = receivableStanding(
      [item("a", "2026-06-01", 1000)],
      [paid("p1", "2026-06-02", 1500)]
    );
    expect(ahead).toMatchObject({
      owingMoney: 0,
      paidAheadMoney: 500,
      oldestOn: null,
    });

    const later = receivableStanding(
      [item("a", "2026-06-01", 1000), item("b", "2026-06-05", 800)],
      [paid("p1", "2026-06-02", 1500)]
    );
    expect(later).toMatchObject({ owingMoney: 300, paidAheadMoney: 0 });
  });

  it("reads a Correction that shrank an old Receivable below what was paid on it, as paid ahead", () => {
    const standing = receivableStanding(
      [item("a", "2026-06-01", 500)],
      [paid("p1", "2026-06-02", 1000)]
    );
    expect(standing).toMatchObject({ owingMoney: 0, paidAheadMoney: 500 });
  });

  it("names no promise for what is already paid", () => {
    const standing = receivableStanding(
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

describe("overdue Receivable", () => {
  it("is not late on the day he promised, and is the day after", () => {
    const bull = standingItem("a", "2026-06-01", 20_000, "2026-06-08");
    expect(overdueFrom(bull, 30)).toBe("2026-06-09");
    expect(isReceivableOverdue(bull, "2026-06-08", 30)).toBe(false);
    expect(isReceivableOverdue(bull, "2026-06-09", 30)).toBe(true);
  });

  it("gives milk with no promise the farm's days, and is late the day after they run out", () => {
    const milk = standingItem("d", "2026-06-01", 1750);
    // Thirty days from the first of June is the first of July: still within them.
    expect(isReceivableOverdue(milk, "2026-07-01", 30)).toBe(false);
    expect(isReceivableOverdue(milk, "2026-07-02", 30)).toBe(true);
  });

  it("is still overdue when part is paid, and not when all is", () => {
    expect(
      isReceivableOverdue(
        standingItem("a", "2026-06-01", 5000, "2026-06-08"),
        "2026-06-20",
        30
      )
    ).toBe(true);
    expect(
      isReceivableOverdue(
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

  it("says when he was sold to on credit again while already late", () => {
    const late = standingItem("a", "2026-06-01", 20_000, "2026-06-08");
    const before = standingItem("b", "2026-06-05", 10_000, "2026-06-20");
    const after = standingItem("c", "2026-06-10", 10_000, "2026-06-25");
    expect(soldOnCreditWhileOverdue([late, before], 30)).toBe(false);
    expect(soldOnCreditWhileOverdue([late, after], 30)).toBe(true);
    // Paid off, the late one no longer makes the next a loan to a man who has not paid.
    expect(
      soldOnCreditWhileOverdue([{ ...late, owingMoney: 0 }, after], 30)
    ).toBe(false);
  });
});

const writtenOff = (
  id: string,
  leftOn: string,
  receivableMoney: number,
  writtenOffMoney: number
) => ({ id, leftOn, receivableMoney, promisedBy: null, writtenOffMoney });

describe("Receivable written off", () => {
  it("is no longer owed, and says what stays written off", () => {
    const standing = receivableStanding(
      [writtenOff("a", "2026-06-01", 20_000, 20_000)],
      []
    );
    expect(standing).toMatchObject({
      owingMoney: 0,
      writtenOffMoney: 20_000,
      paidAheadMoney: 0,
    });
  });

  it("is paid last: money clears what is open before it puts a write-off back", () => {
    const standing = receivableStanding(
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

  it("is put back whole by a buyer who pays it all after all, and the rest is paid ahead", () => {
    const standing = receivableStanding(
      [writtenOff("a", "2026-06-01", 20_000, 20_000)],
      [paid("p1", "2026-07-01", 21_000)]
    );
    expect(standing).toMatchObject({
      writtenOffMoney: 0,
      paidAheadMoney: 1000,
    });
  });

  it("leaves the rest owing when only part was written off", () => {
    const standing = receivableStanding(
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
