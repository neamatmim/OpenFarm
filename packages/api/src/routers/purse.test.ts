import { uuidv7 } from "@OpenFarm/db/ids";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { bookMoney } from "../money-store";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Whose money was it: every Money Event names its Purse — the Farm's, or one Venture's — and every reader
 * of the Farm's money reads the Farm's purse alone.
 *
 * Nothing sets a Venture's purse yet; an Intake that names a Venture arrives with the buying increment.
 * So the Venture's Money Event here is written straight to the table, which is the only way to test a
 * shape that has been put in before its writer.
 */
const suffix = `purse-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const PERIOD = { from: "2046-10-01", to: "2046-10-31" };

let ventureId = "";
let categoryId = "";

beforeAll(async () => {
  const owner = await as("owner", "2046-10-01T04:00:00.000Z");
  const one = await owner.client.ventures.open({
    name: `পার্স ${suffix}`,
    targetCapitalBdt: 1_000_000,
    decideBy: "2046-11-20",
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
    unitPriceBdt: 50_000,
  });
  ventureId = one.id;
  // The accountant's export refuses a farm with no registration number, and this file asks for one.
  const identity = await owner.client.farm.identity();
  if (identity.registrationMissing) {
    await owner.client.farm.setIdentity({
      registrationNumber: `DLS-${suffix}`,
    });
  }
  const categories = await owner.client.money.categories();
  categoryId = categories.find((each) => each.key === "utilities")?.id ?? "";
});

/** One Money Event of a Venture's own, written where its writer will one day write it. */
const theVenturesOwnSpend = async (
  amountBdt: number,
  approval: "approved" | "awaiting" = "approved",
  charged?: { categoryId: string; side: "dairy" | "fattening" }
) => {
  const id = uuidv7(new Date());
  await scratchDb()
    .insert(moneyEvent)
    .values({
      id,
      farmId: theFarm().id,
      direction: "out",
      amountBdt: amountBdt.toFixed(2),
      occurredAt: new Date("2046-10-10T04:00:00.000Z"),
      categoryId: charged?.categoryId ?? categoryId,
      side: charged?.side,
      paymentMethod: "bank",
      source: "by_hand",
      sourceId: id,
      note: `ভেঞ্চারের নিজের খরচ ${suffix}`,
      purseVentureId: ventureId,
      approval,
      recordedByRole: "owner",
      recordedAt: new Date("2046-10-10T04:00:00.000Z"),
    });
  return id;
};

describe("whose money was it", () => {
  it("reads everything already recorded as the Farm's", async () => {
    const manager = await as("manager", "2046-10-02T04:00:00.000Z");
    const entered = await manager.client.money.enter({
      categoryId,
      amountBdt: 4000,
      occurredOn: "2046-10-02",
      counterparty: { name: `পল্লী বিদ্যুৎ ${suffix}` },
      paymentMethod: "bank",
      note: `খামারের নিজের খরচ ${suffix}`,
    });
    const owner = await as("owner", "2046-10-02T05:00:00.000Z");
    const money = await owner.client.money.list(PERIOD);
    const mine = money.events.find((one) => one.id === entered.id);
    // Money entered the way the farm has always entered it is the Farm's, and says so by saying nothing.
    expect(mine).toMatchObject({ amountBdt: 4000, purse: null });
  });

  it("keeps a Venture's money out of the Farm's list, and its figures where they were", async () => {
    const owner = await as("owner", "2046-10-11T04:00:00.000Z");
    const before = await owner.client.money.list(PERIOD);
    const beforeOut = before.events
      .filter((one) => one.direction === "out")
      .reduce((sum, one) => sum + one.amountBdt, 0);

    const theirs = await theVenturesOwnSpend(90_000);

    const after = await owner.client.money.list(PERIOD);
    const afterOut = after.events
      .filter((one) => one.direction === "out")
      .reduce((sum, one) => sum + one.amountBdt, 0);
    expect(after.events.map((one) => one.id)).not.toContain(theirs);
    // Ninety thousand taka of somebody else's money, and the Farm's own expense to the poisha unmoved.
    expect(afterOut).toBe(beforeOut);
  });

  it("reads a Venture's own money when the Venture is asked for by name", async () => {
    const owner = await as("owner", "2046-10-12T04:00:00.000Z");
    const theirs = await owner.client.money.list({ ...PERIOD, ventureId });
    expect(theirs.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purse: { id: ventureId, name: `পার্স ${suffix}` },
        }),
      ])
    );
    // And every one of them is that Venture's; none of the Farm's has come with it.
    expect(theirs.events.every((one) => one.purse?.id === ventureId)).toBe(
      true
    );
  });

  it("is the Owner's alone to ask for", async () => {
    const manager = await as("manager", "2046-10-12T05:00:00.000Z");
    // The Manager keeps the farm's register; whose money is in a Venture is not their business.
    await expect(
      manager.client.money.list({ ...PERIOD, ventureId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const theFarms = await manager.client.money.list(PERIOD);
    expect(theFarms.events.every((one) => one.purse === null)).toBe(true);
  });

  it("still puts a Venture's money in front of the Owner to approve, and says whose", async () => {
    const owner = await as("owner", "2046-10-14T04:00:00.000Z");
    const waiting = await theVenturesOwnSpend(120_000, "awaiting");
    const home = await owner.client.home.owner();
    const mine = home.needsYou.moneyAwaiting.find((one) => one.id === waiting);
    // Money waiting for her is work, not a figure: a Venture's waits for her as the Farm's does, and the
    // row says whose it is before she approves somebody else's spending.
    expect(mine).toMatchObject({
      amountBdt: 120_000,
      purseName: `পার্স ${suffix}`,
    });
  });

  it("charges the Farm's animals nothing of a Venture's own cost", async () => {
    const owner = await as("owner", "2046-10-15T04:00:00.000Z");
    const shed = await owner.client.herd.createShed({ name: suffix });
    const pen = await owner.client.herd.createPen({
      shedId: shed.id,
      name: `ফ্যাটেনিং ${suffix}`,
    });
    const spray = await owner.client.money.addCategory({
      nameBn: `মাছি স্প্রে ${suffix}`,
      nameEn: `Fly spray ${suffix}`,
      direction: "out",
    });
    await owner.client.money.setChargedToAnimals({
      categoryId: spray.id,
      chargedToAnimals: true,
    });
    const manager = await as("manager", "2046-10-15T05:00:00.000Z");
    const bull = await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 50_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2046-10-15T05:00:00.000Z"),
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
    });

    const before = await owner.client.costs.ofAnimal({
      tagNumber: bull.tagNumber,
    });
    await theVenturesOwnSpend(60_000, "approved", {
      categoryId: spray.id,
      side: "fattening",
    });
    const after = await owner.client.costs.ofAnimal({
      tagNumber: bull.tagNumber,
    });
    // Sixty thousand taka of a Venture's own spending, and the Farm's bull carries none of it: a Herd
    // Cost is split across the Animals of its Side, and these are not that Venture's animals.
    expect(after.herdBdt).toBe(before.herdBdt);
  });

  it("refuses a wage in anybody's purse but the Farm's", async () => {
    const when = new Date("2046-10-16T04:00:00.000Z");
    const id = uuidv7(when);
    // Straight at the booking door, because no screen can ask for this: the guard is here so that the
    // rule the unique index cannot enforce — one wage per person per month — stays true. The index
    // counts the Farm's purse as nothing, so a wage in another purse would slip past it unseen.
    await expect(
      scratchDb().transaction((tx) =>
        bookMoney(
          tx,
          {
            farm: { id: theFarm().id, approvalThresholdBdt: 100_000 },
            actorId: thePerson("owner").id,
            role: "owner",
            byTheOwner: true,
            now: when,
          },
          {
            source: "by_hand",
            sourceId: id,
            amountBdt: 9000,
            occurredAt: when,
            counterpartyId: null,
            purseVentureId: ventureId,
          },
          {
            id,
            category: { id: categoryId, direction: "out" },
            note: null,
            wageMonth: "2046-10",
            side: null,
          }
        )
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps a Venture's money out of the accountant's export", async () => {
    const owner = await as("owner", "2046-10-13T04:00:00.000Z");
    const exported = await owner.client.reports.accountantExport({
      from: PERIOD.from,
      to: PERIOD.to,
      format: "csv",
    });
    const csv = "csv" in exported ? exported.csv : "";
    expect(csv).toContain(`খামারের নিজের খরচ ${suffix}`);
    expect(csv).not.toContain(`ভেঞ্চারের নিজের খরচ ${suffix}`);
  });
});
