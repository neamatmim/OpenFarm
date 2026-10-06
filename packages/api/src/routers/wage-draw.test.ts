import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Wage Draw: a person's money ahead of payday, its own money under Wages the day it went, and taken off the month's
// wage at payday so nobody is paid twice — a draw bigger than the wage carrying over.

const suffix = `wage-draw-${Date.now()}`;
const RAHIM = `রহিম ${suffix}`;
const KARIM = `করিম ${suffix}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let wagesId = "";

beforeAll(async () => {
  await as("owner", "2073-05-01T04:00:00.000Z");
  const manager = await as("manager", "2073-05-01T04:00:00.000Z");
  const categories = await manager.client.money.categories.list();
  wagesId = categories.find((one) => one.key === "wages")?.id ?? "";
});

const draw = async (name: string, amountMoney: number, day: string) => {
  const manager = await as("manager", `${day}T06:00:00.000Z`);
  return await manager.client.money.drawWage({
    counterparty: { name },
    amountMoney,
    drawnOn: day,
  });
};

const payWage = async (
  name: string,
  amountMoney: number,
  wageMonth: string,
  day: string
) => {
  const manager = await as("manager", `${day}T06:00:00.000Z`);
  return await manager.client.money.enter({
    categoryId: wagesId,
    amountMoney,
    occurredOn: day,
    counterparty: { name },
    wageMonth,
  });
};

const openOf = async (name: string) => {
  const manager = await as("manager", "2073-08-01T06:00:00.000Z");
  const open = await manager.client.money.openDraws();
  return open.find((one) => one.name === name)?.openMoney ?? 0;
};

const bookedOf = async (id: string) =>
  await scratchDb().query.moneyEvent.findFirst({
    where: { id },
    columns: { amountMoney: true },
    with: { category: { columns: { key: true } } },
  });

describe("a Wage Draw", () => {
  it("goes out under Wages the day it is drawn, and is owed until payday", async () => {
    const first = await draw(RAHIM, 2000, "2073-05-03");
    await draw(RAHIM, 1000, "2073-05-10");
    const money = await scratchDb().query.moneyEvent.findFirst({
      where: { source: "wage_draw", sourceId: first.id },
      columns: { amountMoney: true, direction: true },
      with: { category: { columns: { key: true } } },
    });
    expect(money).toMatchObject({
      amountMoney: 2000,
      direction: "out",
      category: { key: "wages" },
    });
    expect(await openOf(RAHIM)).toBe(3000);
  });

  it("comes off the month's wage at payday, which books only what is paid now", async () => {
    const wage = await payWage(RAHIM, 12_000, "2073-05", "2073-06-01");
    expect(wage.drawsTakenMoney).toBe(3000);
    expect(await bookedOf(wage.id)).toMatchObject({
      amountMoney: 9000,
      category: { key: "wages" },
    });
    expect(await openOf(RAHIM)).toBe(0);
  });

  it("carries over what a wage could not take, to the next payday", async () => {
    await draw(KARIM, 8000, "2073-05-05");
    const may = await payWage(KARIM, 5000, "2073-05", "2073-06-01");
    expect(may.drawsTakenMoney).toBe(5000);
    expect(await bookedOf(may.id)).toMatchObject({ amountMoney: 0 });
    expect(await openOf(KARIM)).toBe(3000);
    const june = await payWage(KARIM, 10_000, "2073-06", "2073-07-01");
    expect(june.drawsTakenMoney).toBe(3000);
    expect(await bookedOf(june.id)).toMatchObject({ amountMoney: 7000 });
    expect(await openOf(KARIM)).toBe(0);
  });

  it("leaves a wage that took draws standing by its amount", async () => {
    await draw(`${RAHIM} ২`, 1000, "2073-05-03");
    const wage = await payWage(`${RAHIM} ২`, 6000, "2073-05", "2073-06-01");
    const manager = await as("manager", "2073-06-02T06:00:00.000Z");
    await expect(
      manager.client.money.correctEntered({
        id: wage.id,
        changes: { amountMoney: { from: 5000, to: 5500 } },
        reason: `ভুল লেখা ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "wage_took_draws" } });
  });

  it("is put right with its money, and taken back whole by putting it to nothing", async () => {
    const name = `সেলিম ${suffix}`;
    const first = await draw(name, 2000, "2073-06-10");
    const manager = await as("manager", "2073-06-10T08:00:00.000Z");
    await manager.client.money.correctDraw({
      id: first.id,
      changes: {
        amountMoney: { from: 2000, to: 2500 },
        paymentMethod: { from: "cash", to: "mobile_money" },
      },
      reason: `আড়াই হাজার, বিকাশে ${suffix}`,
    });
    const money = await scratchDb().query.moneyEvent.findMany({
      where: { source: "wage_draw", sourceId: first.id },
      columns: { amountMoney: true, paymentMethod: true, heldBy: true },
    });
    expect(money).toEqual([
      { amountMoney: 2500, paymentMethod: "mobile_money", heldBy: null },
    ]);
    expect(await openOf(name)).toBe(2500);
    await manager.client.money.correctDraw({
      id: first.id,
      changes: { amountMoney: { from: 2500, to: 0 } },
      reason: `অগ্রিম নেওয়াই হয়নি ${suffix}`,
    });
    expect(await openOf(name)).toBe(0);
  });

  it("moves to the person who drew it, while no payday has taken it", async () => {
    const wrong = `জামাল ${suffix}`;
    const right = `কামাল ${suffix}`;
    const one = await draw(wrong, 1500, "2073-06-12");
    const manager = await as("manager", "2073-06-12T08:00:00.000Z");
    await manager.client.money.correctDraw({
      id: one.id,
      changes: { counterparty: { from: wrong, to: { name: right } } },
      reason: `ভুল নামে লেখা ${suffix}`,
    });
    expect(await openOf(wrong)).toBe(0);
    expect(await openOf(right)).toBe(1500);
    const wage = await payWage(right, 6000, "2073-06", "2073-07-01");
    expect(wage.drawsTakenMoney).toBe(1500);
  });

  it("keeps what a payday took: never below it, and never moved to somebody else", async () => {
    const name = `নাসির ${suffix}`;
    const one = await draw(name, 4000, "2073-06-14");
    await payWage(name, 3000, "2073-06", "2073-07-01");
    const manager = await as("manager", "2073-07-01T08:00:00.000Z");
    await expect(
      manager.client.money.correctDraw({
        id: one.id,
        changes: { amountMoney: { from: 4000, to: 2000 } },
        reason: `কম লেখা ${suffix}`,
      })
    ).rejects.toMatchObject({
      data: { refusal: "draw_already_taken", takenMoney: 3000 },
    });
    await expect(
      manager.client.money.correctDraw({
        id: one.id,
        changes: {
          counterparty: { from: name, to: { name: `অন্য কেউ ${suffix}` } },
        },
        reason: `অন্যের অগ্রিম ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "draw_already_taken" } });
    // Down to what was taken is the draw closed, and nothing is left to take.
    await manager.client.money.correctDraw({
      id: one.id,
      changes: { amountMoney: { from: 4000, to: 3000 } },
      reason: `তিন হাজারই নিয়েছিল ${suffix}`,
    });
    expect(await openOf(name)).toBe(0);
  });
});

describe("a wage and its draws, however a name is typed", () => {
  // "মিয়া" typed on two keyboards: য় as one letter, or as য and its nukta — the same name to anybody reading it.
  const ONE_LETTER = `সেলিম মিয়া ${suffix}`;
  const TWO_LETTERS = `সেলিম মিয়া ${suffix}`;

  it("is one person: the draw comes off the wage, and the month takes one wage", async () => {
    await draw(ONE_LETTER, 3000, "2073-10-05");
    const wage = await payWage(TWO_LETTERS, 12_000, "2073-10", "2073-11-01");
    expect(wage.drawsTakenMoney).toBe(3000);
    await expect(
      payWage(ONE_LETTER, 12_000, "2073-10", "2073-11-02")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is judged whole against the Approval Threshold, whatever its draws took off it", async () => {
    // A 25,000 wage over the farm's 20,000 line, 6,000 of it drawn a month before payday.
    const name = `জামাল ${suffix}`;
    await draw(name, 6000, "2073-12-05");
    const wage = await payWage(name, 25_000, "2073-12", "2074-01-01");
    const booked = await scratchDb().query.moneyEvent.findFirst({
      where: { id: wage.id },
      columns: { amountMoney: true, approval: true },
    });
    expect(booked).toMatchObject({ amountMoney: 19_000, approval: "awaiting" });
  });

  it("asks about a draw written twice, as any money entered by hand is asked", async () => {
    const name = `কামাল ${suffix}`;
    await draw(name, 2000, "2074-02-03");
    await expect(draw(name, 2000, "2074-02-03")).rejects.toMatchObject({
      data: { refusal: "looks_entered_already" },
    });
  });
});

describe("a Dairy milker's wage, part drawn", () => {
  it("is the Dairy side's whole, on the accountant's paper as on Costs by Side", async () => {
    const manager = await as("manager", "2074-04-02T06:00:00.000Z");
    const identity = await manager.client.farm.identity();
    if (identity.registrationMissing) {
      await manager.client.farm.setIdentity({
        registrationNumber: `DLS/SAV/2074/${suffix}`,
      });
    }
    const name = `দুধের মজুর ${suffix}`;
    const drawer = await as("manager", "2074-03-10T06:00:00.000Z");
    await drawer.client.money.drawWage({
      counterparty: { name },
      amountMoney: 3000,
      drawnOn: "2074-03-10",
      side: "dairy",
    });
    const payer = await as("manager", "2074-03-31T06:00:00.000Z");
    await payer.client.money.enter({
      categoryId: wagesId,
      amountMoney: 12_000,
      occurredOn: "2074-03-31",
      counterparty: { name },
      wageMonth: "2074-03",
      side: "dairy",
    });
    const owner = await as("owner", "2074-04-02T06:00:00.000Z");
    const { summary } = await owner.client.reports.accountantExport({
      from: "2074-03-01",
      to: "2074-03-31",
      format: "paper",
    });
    expect(summary?.bySide.find((one) => one.side === null)).toBeUndefined();
    expect(summary?.bySide.find((one) => one.side === "dairy")).toMatchObject({
      outMoney: 12_000,
    });
  });
});
