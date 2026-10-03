import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Overdue Receivable: past the day the buyer promised, or — with no promise — past the farm's days for it. Named on the
 * Manager's queue and the Owner's list with a number to ring, told once in the Digest, and never sent to the buyer.
 */
const suffix = `late-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const WINDOW = {
  targetWindowStart: "2050-08-17",
  targetWindowEnd: "2050-08-19",
};
const TRADER = `দেরির ব্যাপারী ${suffix}`;
const SHOP = `দেরির দোকান ${suffix}`;

let penId = "";

const sellOnCredit = async (instant: string, promisedBy: string) => {
  const manager = await as("manager", instant);
  const bull = await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ...WINDOW,
  });
  return await manager.client.sales.record({
    tagNumber: bull.tagNumber,
    buyer: { name: TRADER, phone: "+8801711000099" },
    priceMoney: 120_000,
    paidNowMoney: 100_000,
    promisedBy,
    weightKg: 330,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ট্রাক",
    driver: `চালক ${suffix}`,
  });
};

const theTrader = (rows: readonly { name: string }[] | undefined) =>
  rows?.find((one) => one.name === TRADER);

beforeAll(async () => {
  const owner = await as("owner", "2050-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // Twenty thousand owed on a bull, promised by the eighth of March.
  await sellOnCredit("2050-03-01T05:00:00.000Z", "2050-03-08");
  // A can of milk to the sweet shop with no day promised.
  const manager = await as("manager", "2050-03-01T06:00:00.000Z");
  await manager.client.milk.dispatch({
    dispatchedAt: new Date("2050-03-01T03:00:00.000Z"),
    litres: 25,
    buyer: { name: SHOP },
    pricePerLitreMoney: 70,
    paidNowMoney: 0,
  });
});

describe("the farm's days for a Receivable with no promise", () => {
  it("are the Owner's to set, and not the Manager's", async () => {
    const manager = await as("manager", "2050-03-01T07:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ receivableDays: 20 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owner = await as("owner", "2050-03-01T07:00:00.000Z");
    await owner.client.farm.setParameters({ receivableDays: 14 });
    await expect(
      owner.client.farm.setParameters({ receivableDays: 3 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("overdue Receivable on the homes", () => {
  it("is not named on the day he promised", async () => {
    const manager = await as("manager", "2050-03-08T06:00:00.000Z");
    const home = await manager.client.home.manager();
    expect(theTrader(home.queue.receivableOverdue)).toBeUndefined();
  });

  it("is named to the Manager the day after, with what is late, since when and his phone", async () => {
    const manager = await as("manager", "2050-03-09T06:00:00.000Z");
    const home = await manager.client.home.manager();
    expect(theTrader(home.queue.receivableOverdue)).toMatchObject({
      overdueMoney: 20_000,
      overdueSince: "2050-03-09",
      phone: "+8801711000099",
      soldAgainWhileOverdue: false,
    });
  });

  it("names milk with no promise only once the farm's days have run", async () => {
    // Fourteen days, as the Owner set them: the fifteenth of March is still inside them, the sixteenth is not.
    const on = async (instant: string) => {
      const manager = await as("manager", instant);
      const home = await manager.client.home.manager();
      return home.queue.receivableOverdue.find((one) => one.name === SHOP);
    };
    expect(await on("2050-03-15T06:00:00.000Z")).toBeUndefined();
    expect(await on("2050-03-16T06:00:00.000Z")).toMatchObject({
      overdueSince: "2050-03-16",
      overdueMoney: 1750,
    });
  });

  it("tells the Owner when he was sold to on credit again while late, and the sheets say he is overdue", async () => {
    await sellOnCredit("2050-03-10T05:00:00.000Z", "2050-03-20");
    const owner = await as("owner", "2050-03-10T08:00:00.000Z");
    const home = await owner.client.home.owner();
    expect(theTrader(home.needsYou.receivableOverdue)).toMatchObject({
      overdueMoney: 20_000,
      owingMoney: 40_000,
      soldAgainWhileOverdue: true,
    });
    const his = await owner.client.receivables.ofBuyer({ name: TRADER });
    expect(his?.overdueSince).toBe("2050-03-09");
  });

  it("leaves him off once what was late is paid, however late", async () => {
    const manager = await as("manager", "2050-03-11T06:00:00.000Z");
    await manager.client.receivables.pay({
      buyer: TRADER,
      kind: "cattle",
      amountMoney: 20_000,
      paidOn: "2050-03-11",
      paymentMethod: "cash",
    });
    const home = await manager.client.home.manager();
    expect(theTrader(home.queue.receivableOverdue)).toBeUndefined();
  });
});

describe("overdue Receivable in the Digest", () => {
  it("is told to the Manager once, however many mornings it stays late", async () => {
    const told = async () => {
      const rows = await scratchDb().query.alert.findMany({
        where: { kind: "receivable_overdue", userId: thePerson("manager").id },
        columns: { params: true },
      });
      return rows.filter(
        (one) => (one.params as { buyer?: string }).buyer === SHOP
      ).length;
    };
    const sweepOn = async (instant: string) => {
      const manager = await as("manager", instant);
      await manager.client.alerts.sweep();
    };
    await sweepOn("2050-03-15T06:00:00.000Z");
    expect(await told()).toBe(0);
    await sweepOn("2050-03-16T06:00:00.000Z");
    expect(await told()).toBe(1);
    await sweepOn("2050-03-17T06:00:00.000Z");
    expect(await told()).toBe(1);
  });
});
