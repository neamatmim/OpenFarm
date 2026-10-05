import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The farm's years and the changes the Owner records to them (ADR 0016, 0017). On 17 August 2026 Bangladesh's Cabinet
// decided to move the fiscal year to April–March, with 2027–28 a nine-month Transition Year from July 2027 to March
// 2028 (docs/research/financial-year-changes.md). The farm records it in October 2026, puts it right, and reads its
// years by it. The cases run in order on this file's own farm.

const OCTOBER_2026 = "2026-10-05T04:00:00.000Z";
const NOVEMBER_2027 = "2027-11-10T04:00:00.000Z";
const APRIL_2028 = "2028-04-10T04:00:00.000Z";
const LAW =
  "Cabinet decision of 17 August 2026: the fiscal year moves to April–March";

const as = (role: "owner" | "manager", instant = OCTOBER_2026) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const starts = (years: readonly { start: string; months: number }[]) =>
  years.map((one) => `${one.start} ${one.months}`);

describe("the farm's financial years", () => {
  it("run from July to June until a change, to those who run the farm", async () => {
    const { client: manager } = await as("manager");
    const years = await manager.financialYears.list();

    expect(years.firstStarts).toBe(7);
    expect(years.previous).toMatchObject({ start: "2025-07", months: 12 });
    expect(years.current).toMatchObject({
      start: "2026-07",
      from: "2026-07-01",
      to: "2027-06-30",
      months: 12,
    });
    expect(starts(years.ahead)).toEqual([
      "2026-07 12",
      "2027-07 12",
      "2028-07 12",
      "2029-07 12",
    ]);
  });

  it("change only by the Owner's hand", async () => {
    const { client: manager } = await as("manager");

    await expect(
      manager.financialYears.recordChange({
        changingFrom: "2027-07",
        newFrom: "2028-04",
        reason: LAW,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuse a change that would move a year that has ended", async () => {
    const { client: owner } = await as("owner");

    await expect(
      owner.financialYears.recordChange({
        changingFrom: "2025-07",
        newFrom: "2026-04",
        reason: LAW,
      })
    ).rejects.toMatchObject({
      data: { refusal: "year_change_reaches_an_ended_year" },
    });
  });

  it("take Bangladesh's change: 2027–28 runs nine months, and April years follow", async () => {
    const { client: owner } = await as("owner");
    const { id } = await owner.financialYears.recordChange({
      changingFrom: "2027-07",
      newFrom: "2028-04",
      reason: LAW,
    });
    const years = await owner.financialYears.list();

    expect(starts(years.ahead)).toEqual([
      "2026-07 12",
      "2027-07 9",
      "2028-04 12",
      "2029-04 12",
    ]);
    expect(years.ahead[1]).toMatchObject({ to: "2028-03-31" });
    expect(years.changes).toEqual([
      expect.objectContaining({
        id,
        changingFrom: "2027-07",
        newFrom: "2028-04",
        reason: LAW,
        withdrawn: null,
        withdrawable: true,
      }),
    ]);
    const trail = await owner.audit.list({
      entity: "financial_year_change",
      limit: 5,
    });
    expect(trail.map((event) => event.entityId)).toContain(id);
  });

  it("put right by withdrawing it, with why, and recording it again", async () => {
    const { client: owner } = await as("owner");
    const { changes } = await owner.financialYears.list();
    const [standing] = changes;
    await owner.financialYears.withdrawChange({
      changeId: standing?.id ?? "",
      reason: "Recorded before the law was passed",
    });
    const withdrawn = await owner.financialYears.list();

    expect(starts(withdrawn.ahead).slice(0, 2)).toEqual([
      "2026-07 12",
      "2027-07 12",
    ]);
    expect(withdrawn.changes[0]?.withdrawn).toMatchObject({
      reason: "Recorded before the law was passed",
    });

    await owner.financialYears.recordChange({
      changingFrom: "2027-07",
      newFrom: "2028-04",
      reason: LAW,
    });
    const again = await owner.financialYears.list();
    expect(starts(again.ahead).slice(0, 3)).toEqual([
      "2026-07 12",
      "2027-07 9",
      "2028-04 12",
    ]);
  });

  it("read the Transition Year in the monthly report, nine months so far", async () => {
    const { client: owner } = await as("owner", APRIL_2028);
    const lastYear = await owner.monthlyReport.get({
      financialYear: "2027-07",
    });
    const thisYear = await owner.monthlyReport.get({
      financialYear: "2028-04",
    });

    expect(lastYear.financialYear).toMatchObject({ months: 9 });
    expect(lastYear.months.map((one) => one.month)).toEqual([
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
      "2027-11",
      "2027-12",
      "2028-01",
      "2028-02",
      "2028-03",
    ]);
    expect(lastYear.months.some((one) => one.soFar)).toBe(false);
    expect(thisYear.months.map((one) => one.month)).toEqual(["2028-04"]);
    await expect(
      owner.monthlyReport.get({ financialYear: "2028-07" })
    ).rejects.toMatchObject({ data: { refusal: "no_such_financial_year" } });
  });

  it("keep a change once its Transition Year has ended", async () => {
    const { client: owner } = await as("owner", APRIL_2028);
    const { changes } = await owner.financialYears.list();
    const [standing] = changes;

    expect(standing?.withdrawable).toBe(false);
    await expect(
      owner.financialYears.withdrawChange({
        changeId: standing?.id ?? "",
        reason: "Too late",
      })
    ).rejects.toMatchObject({
      data: { refusal: "year_change_reaches_an_ended_year" },
    });
  });

  it("may still be withdrawn while the Transition Year runs", async () => {
    const { client: owner } = await as("owner", NOVEMBER_2027);
    const { changes } = await owner.financialYears.list();
    const [standing] = changes;

    expect(standing?.withdrawable).toBe(true);
  });
});

describe("a Transition Year longer than a calendar year", () => {
  it("is listed and exported whole: a period runs to the longest year the farm can have", async () => {
    const { client: owner } = await as("owner");
    // Eighteen months, as a Year Change from July to January can make one: listed and exported as one year.
    const listed = await owner.money.list({
      from: "2027-07-01",
      to: "2028-12-31",
    });
    expect(listed.events).toBeDefined();
    await owner.farm.setIdentity({
      address: "সাভার, ঢাকা",
      phone: "+8801711000095",
      registrationNumber: "DLS/SAV/2027/0018",
      registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
      registrationExpiresOn: "2030-03-31",
    });
    // A client reads the farm once, when it is made: a fresh one reads it registered.
    const { client: registered } = await as("owner");
    await registered.reports.accountantExport({
      from: "2027-07-01",
      to: "2028-12-31",
      format: "csv",
    });
    // Longer than any year can be is still refused.
    await expect(
      owner.money.list({ from: "2027-07-01", to: "2029-08-01" })
    ).rejects.toMatchObject({ data: { refusal: "period_too_long" } });
  });
});
