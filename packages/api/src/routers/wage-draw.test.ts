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
  const categories = await manager.client.money.categories();
  wagesId = categories.find((one) => one.key === "wages")?.id ?? "";
});

const draw = async (name: string, amountBdt: number, day: string) => {
  const manager = await as("manager", `${day}T06:00:00.000Z`);
  return await manager.client.money.drawWage({
    counterparty: { name },
    amountBdt,
    drawnOn: day,
  });
};

const payWage = async (
  name: string,
  amountBdt: number,
  wageMonth: string,
  day: string
) => {
  const manager = await as("manager", `${day}T06:00:00.000Z`);
  return await manager.client.money.enter({
    categoryId: wagesId,
    amountBdt,
    occurredOn: day,
    counterparty: { name },
    wageMonth,
  });
};

const openOf = async (name: string) => {
  const manager = await as("manager", "2073-08-01T06:00:00.000Z");
  const open = await manager.client.money.openDraws();
  return open.find((one) => one.name === name)?.openBdt ?? 0;
};

const bookedOf = async (id: string) =>
  await scratchDb().query.moneyEvent.findFirst({
    where: { id },
    columns: { amountBdt: true },
    with: { category: { columns: { key: true } } },
  });

describe("a Wage Draw", () => {
  it("goes out under Wages the day it is drawn, and is owed until payday", async () => {
    const first = await draw(RAHIM, 2000, "2073-05-03");
    await draw(RAHIM, 1000, "2073-05-10");
    const money = await scratchDb().query.moneyEvent.findFirst({
      where: { source: "wage_draw", sourceId: first.id },
      columns: { amountBdt: true, direction: true },
      with: { category: { columns: { key: true } } },
    });
    expect(money).toMatchObject({
      amountBdt: 2000,
      direction: "out",
      category: { key: "wages" },
    });
    expect(await openOf(RAHIM)).toBe(3000);
  });

  it("comes off the month's wage at payday, which books only what is paid now", async () => {
    const wage = await payWage(RAHIM, 12_000, "2073-05", "2073-06-01");
    expect(wage.drawsTakenBdt).toBe(3000);
    expect(await bookedOf(wage.id)).toMatchObject({
      amountBdt: 9000,
      category: { key: "wages" },
    });
    expect(await openOf(RAHIM)).toBe(0);
  });

  it("carries over what a wage could not take, to the next payday", async () => {
    await draw(KARIM, 8000, "2073-05-05");
    const may = await payWage(KARIM, 5000, "2073-05", "2073-06-01");
    expect(may.drawsTakenBdt).toBe(5000);
    expect(await bookedOf(may.id)).toMatchObject({ amountBdt: 0 });
    expect(await openOf(KARIM)).toBe(3000);
    const june = await payWage(KARIM, 10_000, "2073-06", "2073-07-01");
    expect(june.drawsTakenBdt).toBe(3000);
    expect(await bookedOf(june.id)).toMatchObject({ amountBdt: 7000 });
    expect(await openOf(KARIM)).toBe(0);
  });

  it("leaves a wage that took draws standing by its amount", async () => {
    await draw(`${RAHIM} ২`, 1000, "2073-05-03");
    const wage = await payWage(`${RAHIM} ২`, 6000, "2073-05", "2073-06-01");
    const manager = await as("manager", "2073-06-02T06:00:00.000Z");
    await expect(
      manager.client.money.correctEntered({
        id: wage.id,
        changes: { amountBdt: { from: 5000, to: 5500 } },
        reason: `ভুল লেখা ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "wage_took_draws" } });
  });
});
