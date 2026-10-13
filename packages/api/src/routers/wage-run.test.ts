import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A month's wages paid all at once: everybody paid last month offered at last month's whole wage, their draws taken
// off what is paid now, ticked and saved together — each still a wage of its own, under every rule a single wage keeps.

const suffix = `wage-run-${Date.now()}`;
const RAHIM = `রহিম মিয়া ${suffix}`;
const KARIM = `করিম ${suffix}`;
const SELIM = `সেলিম ${suffix}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let wagesId = "";
let rentId = "";

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

const draw = async (name: string, amountMoney: number, day: string) => {
  const manager = await as("manager", `${day}T06:00:00.000Z`);
  await manager.client.money.drawWage({
    counterparty: { name },
    amountMoney,
    drawnOn: day,
  });
};

const runFor = async (month: string, instant: string) => {
  const manager = await as("manager", instant);
  return await manager.client.money.wageRun({ month });
};

beforeAll(async () => {
  await as("owner", "2075-03-01T04:00:00.000Z");
  await as("staff", "2075-03-01T04:00:00.000Z");
  const manager = await as("manager", "2075-03-01T04:00:00.000Z");
  const categories = await manager.client.money.categories.list();
  wagesId = categories.find((one) => one.key === "wages")?.id ?? "";
  rentId = categories.find((one) => one.key === "rent")?.id ?? "";
  // March: Karim drew 2,000 and March's wage took it, so March paid him 8,000 of a 10,000 wage.
  await draw(KARIM, 2000, "2075-03-10");
  await payWage(RAHIM, 12_000, "2075-03", "2075-04-01");
  await payWage(KARIM, 10_000, "2075-03", "2075-04-01");
  // April: Rahim has drawn 3,000 ahead of payday.
  await draw(RAHIM, 3000, "2075-04-12");
});

describe("a month's wages", () => {
  it("offers everybody paid last month at last month's whole wage, with what payday takes off their draws", async () => {
    const run = await runFor("2075-04", "2075-05-01T05:00:00.000Z");
    const mine = run.rows.filter((one) => one.name.endsWith(suffix));

    expect(mine).toMatchObject([
      {
        name: KARIM,
        wageMoney: 10_000,
        drawsTakenMoney: 0,
        paidNowMoney: 10_000,
        paid: false,
      },
      {
        name: RAHIM,
        wageMoney: 12_000,
        drawsTakenMoney: 3000,
        paidNowMoney: 9000,
        paid: false,
      },
    ]);
  });

  it("pays the ticked wages together, each a wage of its own that takes its own draws", async () => {
    const run = await runFor("2075-04", "2075-05-01T05:00:00.000Z");
    const rahim = run.rows.find((one) => one.name === RAHIM);
    const karim = run.rows.find((one) => one.name === KARIM);
    const manager = await as("manager", "2075-05-01T06:00:00.000Z");

    const paid = await manager.client.money.payWages({
      month: "2075-04",
      occurredOn: "2075-05-01",
      paymentMethod: "cash",
      wages: [
        { personId: rahim?.personId ?? "", amountMoney: 12_000 },
        { personId: karim?.personId ?? "", amountMoney: 10_500 },
      ],
    });

    expect(paid.ids).toHaveLength(2);
    const booked = await scratchDb().query.moneyEvent.findMany({
      where: { id: { in: paid.ids } },
      columns: { amountMoney: true, wageMonth: true, categoryId: true },
      with: { counterparty: { columns: { name: true } } },
    });
    expect(
      booked
        .map((one) => ({
          name: one.counterparty?.name,
          amountMoney: one.amountMoney,
          wageMonth: one.wageMonth,
          wages: one.categoryId === wagesId,
        }))
        .toSorted((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    ).toEqual([
      { name: KARIM, amountMoney: 10_500, wageMonth: "2075-04", wages: true },
      { name: RAHIM, amountMoney: 9000, wageMonth: "2075-04", wages: true },
    ]);
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "money_event", entityId: { in: paid.ids } },
      columns: { action: true },
    });
    expect(trail).toHaveLength(2);
    const after = await runFor("2075-04", "2075-05-01T07:00:00.000Z");
    expect(
      after.rows
        .filter((one) => one.name.endsWith(suffix))
        .map((one) => one.paid)
    ).toEqual([true, true]);
  });

  it("enters none of a run that holds a wage already entered for the month", async () => {
    await payWage(SELIM, 9000, "2075-04", "2075-05-01");
    await payWage(SELIM, 9000, "2075-05", "2075-06-01");
    const run = await runFor("2075-05", "2075-06-01T05:00:00.000Z");
    const rahim = run.rows.find((one) => one.name === RAHIM);
    const selim = run.rows.find((one) => one.name === SELIM);
    const manager = await as("manager", "2075-06-01T06:00:00.000Z");

    await expect(
      manager.client.money.payWages({
        month: "2075-05",
        occurredOn: "2075-06-01",
        paymentMethod: "cash",
        wages: [
          { personId: rahim?.personId ?? "", amountMoney: 12_000 },
          { personId: selim?.personId ?? "", amountMoney: 9000 },
        ],
      })
    ).rejects.toMatchObject({ data: { refusal: "wage_already_entered" } });
    const rahimsMay = await scratchDb().query.moneyEvent.findFirst({
      where: { counterpartyId: rahim?.personId ?? "", wageMonth: "2075-05" },
      columns: { id: true },
    });
    expect(rahimsMay).toBeUndefined();
  });

  it("waits for the Owner over the approval line, as a single wage does", async () => {
    const big = `বড় মজুরি ${suffix}`;
    await payWage(big, 15_000, "2075-06", "2075-07-01");
    const run = await runFor("2075-07", "2075-08-01T05:00:00.000Z");
    const row = run.rows.find((one) => one.name === big);
    const manager = await as("manager", "2075-08-01T06:00:00.000Z");

    const paid = await manager.client.money.payWages({
      month: "2075-07",
      occurredOn: "2075-08-01",
      paymentMethod: "cash",
      wages: [{ personId: row?.personId ?? "", amountMoney: 25_000 }],
    });

    const [booked] = await scratchDb().query.moneyEvent.findMany({
      where: { id: { in: paid.ids } },
      columns: { approval: true },
    });
    expect(booked?.approval).toBe("awaiting");
  });

  it("ends two runs for the same month at once in one wage and a refusal, never a database error", async () => {
    const both = `দুই খাতা ${suffix}`;
    await payWage(both, 7000, "2075-08", "2075-09-01");
    const run = await runFor("2075-09", "2075-10-01T05:00:00.000Z");
    const row = run.rows.find((one) => one.name === both);
    const one = await as("manager", "2075-10-01T06:00:00.000Z");
    const other = await as("owner", "2075-10-01T06:00:00.000Z");
    const sending = {
      month: "2075-09",
      occurredOn: "2075-10-01",
      wages: [{ personId: row?.personId ?? "", amountMoney: 7000 }],
    };

    const results = await Promise.allSettled([
      one.client.money.payWages(sending),
      other.client.money.payWages(sending),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.flatMap((r) =>
      r.status === "rejected" ? [r.reason] : []
    );
    expect(refused).toMatchObject({
      data: { refusal: "wage_already_entered" },
    });
  });

  it("is paid in cash: a run by mobile money is refused whole before anything is entered", async () => {
    const manager = await as("manager", "2075-10-01T06:00:00.000Z");
    const run = await runFor("2075-09", "2075-10-01T05:00:00.000Z");
    const row = run.rows.find((one) => one.name === RAHIM);
    await expect(
      manager.client.money.payWages({
        month: "2075-09",
        occurredOn: "2075-10-01",
        // @ts-expect-error A run is the cash wages; a bank or mobile wage is entered on its own.
        paymentMethod: "mobile_money",
        wages: [{ personId: row?.personId ?? "", amountMoney: 1000 }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("pays nobody who is not a person of this farm's", async () => {
    const manager = await as("manager", "2075-08-01T06:00:00.000Z");
    await expect(
      manager.client.money.payWages({
        month: "2075-07",
        occurredOn: "2075-08-01",
        paymentMethod: "cash",
        wages: [{ personId: "nobody-here", amountMoney: 1000 }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is the Owner's and the Manager's, never Barn Staff's", async () => {
    const staff = await as("staff", "2075-08-01T06:00:00.000Z");
    await expect(
      staff.client.money.wageRun({ month: "2075-07" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("whom a wage may name", () => {
  it("offers everybody paid a wage before and the farm's own people, so a new spelling is a choice", async () => {
    const manager = await as("manager", "2075-08-01T06:00:00.000Z");
    const names = await manager.client.money.wagePeople();

    expect(names).toEqual(expect.arrayContaining([RAHIM, KARIM, "রহিম"]));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("a Monthly Cost not yet entered", () => {
  it("brings what was entered under it last time, so the entry opens filled", async () => {
    const owner = await as("owner", "2075-08-02T04:00:00.000Z");
    await owner.client.money.categories.setPaidMonthly({
      categoryId: rentId,
      paidMonthly: true,
    });
    const manager = await as("manager", "2075-08-03T06:00:00.000Z");
    await manager.client.money.enter({
      categoryId: rentId,
      amountMoney: 18_000,
      occurredOn: "2075-08-03",
      counterparty: { name: `বাড়িওয়ালা ${suffix}` },
    });

    const later = await as("manager", "2075-09-11T06:00:00.000Z");
    const home = await later.client.home.get();

    expect(
      home.queue.monthlyCosts.costs.find((one) => one.categoryId === rentId)
    ).toMatchObject({
      month: "2075-09",
      last: { counterparty: `বাড়িওয়ালা ${suffix}`, amountMoney: 18_000 },
    });
  });

  it("brings a person's last whole wage onto the wage named as not entered", async () => {
    const manager = await as("manager", "2075-06-11T06:00:00.000Z");
    const home = await manager.client.home.get();

    expect(
      home.queue.monthlyCosts.wages.find((one) => one.personName === RAHIM)
    ).toMatchObject({ month: "2075-05", lastWageMoney: 12_000 });
  });
});
