import { paperText } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Money that moves the Farm's cash and is never its income or its cost (ADR 0027; CONTEXT.md: **Outside the
// Results**), worked over March 2048.
//
// On the 3rd the bank lends the farm ৳200,000; on the 5th a chopper is bought for ৳150,000; on the 10th the Owner
// takes ৳10,000 home; on the 20th ৳20,000 of the loan is paid back and ৳2,000 of interest with it; the shed rent is
// ৳9,000. Running the place cost the rent and the interest, ৳11,000 — the chopper, the loan and the Owner's money
// are none of it. The cash moved by all of them: ৳200,000 in, ৳191,000 out, ৳9,000 more than the month began with.

const as = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

const MARCH = "2048-03";
const NOW = "2048-04-10T04:00:00.000Z";

const category: Record<string, string> = {};

/** The id of one of the farm's standard Categories; a test naming one the farm lacks fails, never asks about "". */
const standard = (key: string): string => {
  const id = category[key];
  if (!id) {
    throw new Error(`No standard Category ${key}`);
  }
  return id;
};

const enter = async (key: string, amountMoney: number, occurredOn: string) => {
  const { client } = await as(`${occurredOn}T04:00:00.000Z`);
  await client.money.enter({
    categoryId: standard(key),
    amountMoney,
    occurredOn,
    paymentMethod: "cash",
    counterparty: { name: key === "rent" ? "জমির মালিক" : "সোনালী ব্যাংক" },
  });
};

beforeAll(async () => {
  const { client } = await as("2048-03-01T04:00:00.000Z");
  const identity = await client.farm.identity();
  if (identity.registrationMissing) {
    await client.farm.setIdentity({ registrationNumber: "DLS/SAV/2048/০০১" });
  }
  for (const one of await client.money.categories.list()) {
    if (one.key) {
      category[one.key] = one.id;
    }
  }
  await enter("loan_received", 200_000, "2048-03-03");
  await enter("machine_bought", 150_000, "2048-03-05");
  await enter("owner_drawings", 10_000, "2048-03-10");
  await enter("loan_repaid", 20_000, "2048-03-20");
  await enter("loan_interest", 2000, "2048-03-20");
  await enter("rent", 9000, "2048-03-25");
});

describe("money outside the results", () => {
  it("are standard Categories every farm has, loan interest among the costs", () => {
    expect(Object.keys(category)).toEqual(
      expect.arrayContaining([
        "owner_money_in",
        "owner_drawings",
        "loan_received",
        "loan_repaid",
        "machine_bought",
        "loan_interest",
      ])
    );
  });

  it("are no part of what running the place cost, which the interest is", async () => {
    const { client } = await as(NOW);
    const { figures } = await client.monthlyReport.month({ month: MARCH });

    expect(figures.overheads.amount).toBe(11_000);
    expect(figures.results.farm.overheadsMoney).toBe(11_000);
  });

  it("still moved the cash, and the cash figure says so", async () => {
    const { client } = await as(NOW);
    const { figures } = await client.monthlyReport.month({ month: MARCH });

    expect(figures.money).toMatchObject({
      inMoney: 200_000,
      outMoney: 191_000,
      netMoney: 9000,
    });
  });

  it("are left out of the accountant's income and expense and listed apart", async () => {
    const { client } = await as(NOW);
    const { summary, document } = await client.reports.accountantExport({
      from: "2048-03-01",
      to: "2048-03-31",
      format: "paper",
    });

    expect(summary).toMatchObject({ incomeMoney: 0, expenseMoney: 11_000 });
    expect(summary?.outsideTheResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nameEn: "Loan received", inMoney: 200_000 }),
        expect.objectContaining({
          nameEn: "Machine or building bought",
          outMoney: 150_000,
        }),
        expect.objectContaining({
          nameEn: "Owner's drawings",
          outMoney: 10_000,
        }),
        expect.objectContaining({
          nameEn: "Loan principal repaid",
          outMoney: 20_000,
        }),
      ])
    );
    expect(summary?.byCategory.map((one) => one.nameEn)).not.toContain(
      "Loan received"
    );
    const said = document ? paperText(document, "en") : "";
    expect(said).toContain("Outside the results");
  });

  it("are marked in the accountant's spreadsheet file, so it adds up as the paper does", async () => {
    const { client } = await as(NOW);
    const { csv } = await client.reports.accountantExport({
      from: "2048-03-01",
      to: "2048-03-31",
      format: "csv",
    });
    const [header, ...rows] = (csv ?? "").slice(1).trim().split("\r\n");

    expect(header?.split(",").at(-1)).toBe("outside_the_results");
    expect(
      rows
        .find((row) => row.includes("Loan received"))
        ?.split(",")
        .at(-1)
    ).toBe("yes");
    expect(
      rows
        .find((row) => row.includes("Loan interest"))
        ?.split(",")
        .at(-1)
    ).toBe("no");
  });

  it("can never be charged to the animals", async () => {
    const { client } = await as(NOW);
    await expect(
      client.money.categories.setChargedToAnimals({
        categoryId: standard("machine_bought"),
        chargedToAnimals: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "never_the_animals" } });
  });

  it("is never a cost the month owes, while a loan's interest may be", async () => {
    const { client } = await as(NOW);
    await expect(
      client.money.categories.setPaidMonthly({
        categoryId: standard("loan_repaid"),
        paidMonthly: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "never_monthly" } });
    const listed = await client.money.categories.list();
    expect(
      listed.find((one) => one.key === "loan_interest")?.monthlyMarkable
    ).toBe(true);
  });
});
