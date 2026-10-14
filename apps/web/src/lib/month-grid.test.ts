import { monthlyPaymentAllocationOf, monthlySumsOf } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import {
  gridIsReady,
  linesOfTheMonth,
  payoutLinesOf,
  payoutsOf,
  receiptsOf,
  refusedLineOf,
} from "./month-grid";

const monthly = {
  cattlePartMoney: 40_000,
  sums: monthlySumsOf(58_000, {
    cattlePartMoney: 40_000,
    sums: 9,
    firstDueOn: "2071-02-10",
  }),
};
const allocated = (paidMoney: number, today: string) =>
  monthlyPaymentAllocationOf({
    units: 1,
    unitPriceMoney: 58_000,
    monthly,
    paidMoney,
    today,
  });
const paper = (id: string, paidMoney: number, today = "2071-02-05") => ({
  id,
  investorId: `investor-${id}`,
  capitalLeftMoney: 58_000 - paidMoney,
  paymentAllocation: allocated(paidMoney, today),
  hasPaper: true,
});

describe("the month's capital grid", () => {
  it("fills each line with what its paper is asked for by the month's end, none ticked", () => {
    const lines = linesOfTheMonth(
      [paper("a", 40_000), paper("b", 0)],
      "2071-02-05"
    );

    expect(
      lines.map((one) => [one.agreementId, one.amountMoney, one.came])
    ).toEqual([
      ["a", "2000", false],
      ["b", "42000", false],
    ]);
  });

  it("leaves out a paper paid up, one with no paper on file, and the Farm's own Units", () => {
    const lines = linesOfTheMonth(
      [
        paper("paid", 58_000),
        { ...paper("unpapered", 0), hasPaper: false },
        { ...paper("farms", 0), isFarm: true },
        paper("kept", 0),
      ],
      "2071-02-05"
    );

    expect(lines.map((one) => one.agreementId)).toEqual(["kept"]);
  });

  it("sends only the lines ticked, in their order, and is ready only when each of them is", () => {
    const [a, b] = linesOfTheMonth(
      [paper("a", 40_000), paper("b", 40_000)],
      "2071-02-05"
    );
    if (!(a && b)) {
      throw new Error("two lines expected");
    }
    const came = {
      ...a,
      came: true,
      movedOn: "2071-02-04",
      reference: "TRF-A",
    };
    const ticked = [came, { ...b, came: false }];

    expect(gridIsReady(ticked)).toBe(true);
    expect(receiptsOf(ticked)).toEqual([
      {
        agreementId: "a",
        amountMoney: 2000,
        movedOn: "2071-02-04",
        reference: "TRF-A",
      },
    ]);
    expect(gridIsReady([{ ...came, reference: " " }])).toBe(false);
    expect(gridIsReady([{ ...came, amountMoney: "18001" }])).toBe(false);
    expect(gridIsReady([{ ...b, came: false }])).toBe(false);
  });

  it("works out what a paper may still take when an answer cached before it was sent has none", () => {
    const { capitalLeftMoney: _left, ...cached } = paper("old", 40_000);

    const [line] = linesOfTheMonth([cached], "2071-02-05");

    expect(line?.roomMoney).toBe(18_000);
  });

  it("fills a line from its Investor's waiting Pay-in Note, and sends the note with it", () => {
    const [line] = linesOfTheMonth([paper("a", 40_000)], "2071-02-05", [
      {
        id: "old-note",
        agreementId: "a",
        amountMoney: 1000,
        sentOn: "2071-01-04",
        reference: "OLD",
        state: "received",
      },
      {
        id: "note",
        agreementId: "a",
        amountMoney: 2000,
        sentOn: "2071-02-04",
        reference: "BKASH-1",
        state: "waiting",
      },
    ]);
    if (!line) {
      throw new Error("a line expected");
    }

    expect([line.amountMoney, line.movedOn, line.reference]).toEqual([
      "2000",
      "2071-02-04",
      "BKASH-1",
    ]);
    expect(receiptsOf([{ ...line, came: true }])).toEqual([
      {
        agreementId: "a",
        amountMoney: 2000,
        movedOn: "2071-02-04",
        reference: "BKASH-1",
        payInNoteId: "note",
      },
    ]);
  });

  it("reads which line sent the farm refused, counted from one", () => {
    expect(refusedLineOf({ data: { refusal: "x", row: 2 } })).toBe(1);
    expect(refusedLineOf({ data: { refusal: "x" } })).toBeNull();
    expect(refusedLineOf(new Error("down"))).toBeNull();
  });
});

describe("the payout sheet", () => {
  it("lists every share still to send, and sends the Farm's own account only on the Farm's own line", () => {
    const lines = payoutLinesOf(
      [
        { agreementId: "a", name: "Karim", payoutMoney: 256_000, paid: false },
        { agreementId: "b", name: "Rahim", payoutMoney: 256_000, paid: true },
        { agreementId: "c", name: "Lost", payoutMoney: 0, paid: false },
        { agreementId: "farm", name: "Farm", payoutMoney: 51_000, paid: false },
      ],
      new Set(["farm"])
    );

    expect(lines.map((one) => one.agreementId)).toEqual(["a", "farm"]);
    expect(
      payoutsOf(
        lines.map((one) => ({
          ...one,
          reference: `OUT-${one.agreementId}`,
          farmAccountId: "account-1",
        }))
      )
    ).toEqual([
      { agreementId: "a", amountMoney: 256_000, reference: "OUT-a" },
      {
        agreementId: "farm",
        amountMoney: 51_000,
        reference: "OUT-farm",
        farmAccountId: "account-1",
      },
    ]);
  });
});
