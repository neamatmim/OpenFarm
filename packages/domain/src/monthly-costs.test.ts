import { describe, expect, it } from "vitest";

import { startOfFarmDay } from "./farm-clock";
import { monthlyCostsNotEntered } from "./monthly-costs";

const on = (day: string) => startOfFarmDay(day);
const rent = {
  id: "rent",
  paidMonthlySince: on("2026-06-01"),
  retired: false,
};

const ask = (
  today: string,
  more: Partial<Parameters<typeof monthlyCostsNotEntered>[0]> = {}
) =>
  monthlyCostsNotEntered({
    today,
    dueDay: 10,
    categories: [rent],
    entered: [],
    wages: [],
    ...more,
  });

const karim = (month: string) => ({
  personId: "karim",
  name: "Karim",
  month,
});
const rahim = (month: string) => ({
  personId: "rahim",
  name: "Rahim",
  month,
});

describe("a Monthly Cost with nothing entered", () => {
  it("is named for this month from the due day, and not the day before", () => {
    const entered = [{ categoryId: "rent", occurredAt: on("2026-08-05") }];
    expect(ask("2026-09-09", { entered }).costs).toEqual([]);
    expect(ask("2026-09-10", { entered }).costs).toEqual([
      { categoryId: "rent", month: "2026-09" },
    ]);
  });

  it("is named for last month whatever the day, until something is entered in it", () => {
    expect(ask("2026-09-01").costs).toEqual([
      { categoryId: "rent", month: "2026-08" },
    ]);
    const entered = [{ categoryId: "rent", occurredAt: on("2026-08-28") }];
    expect(ask("2026-09-01", { entered }).costs).toEqual([]);
  });

  it("reaches back from January into the December before it", () => {
    expect(ask("2027-01-15").costs).toEqual([
      { categoryId: "rent", month: "2026-12" },
      { categoryId: "rent", month: "2027-01" },
    ]);
  });

  it("reads the month on the farm's own clock, not UTC", () => {
    // Eleven at night UTC on 31 August is already 1 September in Savar.
    const entered = [
      { categoryId: "rent", occurredAt: new Date("2026-08-31T23:00:00Z") },
    ];
    expect(ask("2026-09-12", { entered }).costs).toEqual([
      { categoryId: "rent", month: "2026-08" },
    ]);
  });

  it("is never named for a month before the Owner marked it", () => {
    const marked = { ...rent, paidMonthlySince: on("2026-09-20") };
    expect(ask("2026-09-25", { categories: [marked] }).costs).toEqual([
      { categoryId: "rent", month: "2026-09" },
    ]);
    expect(ask("2026-09-05", { categories: [marked] }).costs).toEqual([]);
  });

  it("is never named once the Category is retired", () => {
    expect(
      ask("2026-09-25", { categories: [{ ...rent, retired: true }] }).costs
    ).toEqual([]);
  });

  it("counts anything entered under it in the month, whatever it came to", () => {
    const entered = [
      { categoryId: "rent", occurredAt: on("2026-08-02") },
      { categoryId: "rent", occurredAt: on("2026-09-30") },
    ];
    expect(ask("2026-09-30", { entered }).costs).toEqual([]);
  });
});

describe("a wage not entered", () => {
  it("names somebody paid for August and not September, from October's due day", () => {
    const wages = [karim("2026-08"), rahim("2026-08"), rahim("2026-09")];
    expect(ask("2026-10-10", { wages }).wages).toEqual([
      { personId: "karim", name: "Karim", month: "2026-09" },
    ]);
  });

  it("before the due day still asks about the month before, not a month that may not be paid yet", () => {
    const wages = [karim("2026-08"), karim("2026-09")];
    expect(ask("2026-10-09", { wages }).wages).toEqual([]);
    // On the 9th, a wage for September is not looked for yet: it is August's that is asked about, and was paid.
    expect(ask("2026-10-09", { wages: [karim("2026-07")] }).wages).toEqual([
      { personId: "karim", name: "Karim", month: "2026-08" },
    ]);
  });

  it("names somebody who has left only the once", () => {
    const wages = [karim("2026-07"), karim("2026-08")];
    expect(ask("2026-10-10", { wages }).wages).toHaveLength(1);
    expect(ask("2026-11-10", { wages }).wages).toEqual([]);
  });

  it("reaches back from February into December", () => {
    const wages = [karim("2026-12")];
    expect(ask("2027-02-10", { wages }).wages).toEqual([
      { personId: "karim", name: "Karim", month: "2027-01" },
    ]);
  });

  it("keeps two people of one name apart", () => {
    const wages = [
      karim("2026-08"),
      { personId: "karim-2", name: "Karim", month: "2026-08" },
      { personId: "karim-2", name: "Karim", month: "2026-09" },
    ];
    expect(ask("2026-10-10", { wages }).wages).toEqual([
      { personId: "karim", name: "Karim", month: "2026-09" },
    ]);
  });
});
