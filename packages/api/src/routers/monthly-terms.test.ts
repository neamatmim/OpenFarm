import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Venture paid by the month (the advisers' answers, 2026-10-02): each Unit's Cattle Part before the buying and the
// rest in Monthly Sums due on the 10th, worked from its own budgets and dates when it opens and frozen there, so an
// Investor knows the whole schedule before he signs.

const suffix = `${Date.now()}`.slice(-7);

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock("2073-01-02T04:00:00.000Z"),
  });
  return client;
};

const TERMS = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2073-01-20",
  targetWindowStart: "2073-06-01",
  targetWindowEnd: "2073-06-10",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
};

const listed = async (id: string) => {
  const owner = await asOwner();
  const all = await owner.ventures.list();
  return all.find((one) => one.id === id);
};

describe("a Venture paid by the month", () => {
  it("opens on its Cattle Part and a Monthly Sum each 10th from the month after its decision to its window", async () => {
    const owner = await asOwner();

    const { id } = await owner.ventures.open({
      name: `মাসে মাসে ${suffix}`,
      ...TERMS,
      capitalPaid: "by_the_month",
    });

    const venture = await listed(id);
    expect(venture?.capitalPaid).toBe("by_the_month");
    expect(venture?.monthly).toEqual({
      cattlePartMoney: 40_000,
      sums: [
        { dueOn: "2073-02-10", amount: 2500 },
        { dueOn: "2073-03-10", amount: 2500 },
        { dueOn: "2073-04-10", amount: 2500 },
        { dueOn: "2073-05-10", amount: 2500 },
      ],
    });
  });

  it("is refused where no 10th falls before its window opens", async () => {
    const owner = await asOwner();

    await expect(
      owner.ventures.open({
        name: `কোনো মাস নেই ${suffix}`,
        ...TERMS,
        targetWindowStart: "2073-02-10",
        targetWindowEnd: "2073-02-20",
        capitalPaid: "by_the_month",
      })
    ).rejects.toMatchObject({
      data: { refusal: "venture_no_month_to_pay_in" },
    });
  });

  it("is refused where its Cattle Budget is all its capital", async () => {
    const owner = await asOwner();

    await expect(
      owner.ventures.open({
        name: `সবই গরু ${suffix}`,
        ...TERMS,
        cattleBudgetMoney: 1_000_000,
        capitalPaid: "by_the_month",
      })
    ).rejects.toMatchObject({
      data: { refusal: "venture_nothing_to_pay_monthly" },
    });
  });
});

describe("a Venture opened as every one before it", () => {
  it("is paid before buying, with no Monthly Sums", async () => {
    const owner = await asOwner();

    const { id } = await owner.ventures.open({
      name: `একবারে ${suffix}`,
      ...TERMS,
    });

    const venture = await listed(id);
    expect(venture?.capitalPaid).toBe("before_buying");
    expect(venture?.monthly).toBeNull();
  });
});
