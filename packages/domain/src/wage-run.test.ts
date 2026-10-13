import { describe, expect, it } from "vitest";

import { wageRunOf } from "./wage-run";

describe("a month's wages, all at once", () => {
  it("offers everybody paid last month at last month's wage, their draws taken off what is paid now", () => {
    const rows = wageRunOf({
      lastMonth: [
        { personId: "rahim", name: "রহিম", wageMoney: 12_000, side: "dairy" },
        { personId: "karim", name: "করিম", wageMoney: 10_000, side: null },
      ],
      openDraws: [{ personId: "rahim", openMoney: 3000 }],
      paidThisMonth: [],
    });

    expect(rows).toEqual([
      {
        personId: "karim",
        name: "করিম",
        wageMoney: 10_000,
        side: null,
        drawsTakenMoney: 0,
        drawsLeftMoney: 0,
        paidNowMoney: 10_000,
        paid: false,
      },
      {
        personId: "rahim",
        name: "রহিম",
        wageMoney: 12_000,
        side: "dairy",
        drawsTakenMoney: 3000,
        drawsLeftMoney: 0,
        paidNowMoney: 9000,
        paid: false,
      },
    ]);
  });

  it("takes no more draws than the wage, and says what stays owed for next month", () => {
    const [row] = wageRunOf({
      lastMonth: [
        { personId: "rahim", name: "রহিম", wageMoney: 8000, side: null },
      ],
      openDraws: [
        { personId: "rahim", openMoney: 6000 },
        { personId: "rahim", openMoney: 4000 },
      ],
      paidThisMonth: [],
    });

    expect(row).toMatchObject({
      drawsTakenMoney: 8000,
      drawsLeftMoney: 2000,
      paidNowMoney: 0,
    });
  });

  it("marks somebody already paid for the month, so their wage is not entered twice", () => {
    const [row] = wageRunOf({
      lastMonth: [
        { personId: "rahim", name: "রহিম", wageMoney: 12_000, side: null },
      ],
      openDraws: [],
      paidThisMonth: ["rahim"],
    });

    expect(row?.paid).toBe(true);
  });
});
