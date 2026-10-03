import { uuidv7 } from "@OpenFarm/db/ids";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Overheads: what running the place cost — wages, shed rent, electricity — beside the animals' own costs and never part
 * of them, and what it comes to a head a day over every animal that stood here, the Ventures' too.
 */
const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const MARCH = { from: "2045-03-01", to: "2045-03-31" };
/** Midnight on 1 March on the farm's own clock: two animals here from then are 62 head-days by the end of it. */
const FIRST_OF_MARCH = new Date("2045-02-28T18:00:00.000Z");
const WINDOW = {
  targetWindowStart: "2045-06-01",
  targetWindowEnd: "2045-06-05",
};

const category: Record<string, string> = {};
let sprayId = "";

const spend = async (entry: {
  categoryId: string;
  amountMoney: number;
  side?: "dairy" | "fattening";
  wageMonth?: string;
  name?: string;
}) => {
  const manager = await as("manager", "2045-03-20T04:00:00.000Z");
  await manager.client.money.enter({
    categoryId: entry.categoryId,
    amountMoney: entry.amountMoney,
    occurredOn: "2045-03-20",
    counterparty: { name: entry.name ?? "দোকান" },
    paymentMethod: "cash",
    side: entry.side,
    wageMonth: entry.wageMonth,
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2045-02-27T04:00:00.000Z");
  for (const one of await owner.client.money.categories()) {
    if (one.key) {
      category[one.key] = one.id;
    }
  }
  const spray = await owner.client.money.addCategory({
    nameBn: "মাছি স্প্রে",
    direction: "out",
  });
  sprayId = spray.id;
  await owner.client.money.setChargedToAnimals({
    categoryId: sprayId,
    chargedToAnimals: true,
  });
  const shed = await owner.client.herd.createShed({ name: "মোটাতাজাকরণ" });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: "ষাঁড় পেন",
  });
  const venture = await owner.client.ventures.open({
    name: "ঈদ ভেঞ্চার",
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2045-03-20",
    ...WINDOW,
    unitPriceMoney: 50_000,
    units: 10,
  });
  // Capital in first: a bull at the gate is paid from what the account holds.
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 10, unitPriceMoney: 50_000 },
    "overheads",
    "2045-02-27"
  );
  await owner.client.ventures.startBuying({ id: venture.id });

  // One bull the Farm's and one the Venture's, both here all of March.
  const manager = await as("manager", "2045-02-28T18:00:00.000Z");
  for (const ventureId of [undefined, venture.id]) {
    // The Venture's at the gate is the Owner's, paid from its account by bank.
    const buyer = ventureId
      ? // oxlint-disable-next-line no-await-in-loop -- two arrivals, one after the other
        await as("owner", "2045-02-28T18:00:00.000Z")
      : manager;
    // oxlint-disable-next-line no-await-in-loop -- as above
    await buyer.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: "ব্যাপারী" },
      purchasePriceMoney: 50_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      ventureId,
      ...(ventureId ? PAID_FROM_THE_ACCOUNT : {}),
      arrivedAt: FIRST_OF_MARCH,
      ...WINDOW,
    });
  }

  await spend({ categoryId: category.rent ?? "", amountMoney: 18_000 });
  await spend({
    categoryId: category.wages ?? "",
    amountMoney: 12_000,
    wageMonth: "2045-02",
    name: "করিম",
  });
  // A Herd Cost: the fattening animals carry it, so it is theirs and not the place's.
  await spend({ categoryId: sprayId, amountMoney: 3000, side: "fattening" });
  // Under the same marked Category, but naming no Side: it reached no animal, so the place paid it.
  await spend({ categoryId: sprayId, amountMoney: 1000 });
  // Money coming in is not a cost at all.
  await spend({ categoryId: category.manure_sales ?? "", amountMoney: 2500 });
  // The Venture's own money, entered by hand under the rent: never the Farm's, so never what the place cost it.
  // Nothing the app offers writes one yet, so it is written here as its writer would.
  const id = uuidv7(new Date());
  await scratchDb()
    .insert(moneyEvent)
    .values({
      id,
      farmId: theFarm().id,
      direction: "out",
      amountMoney: 40_000,
      occurredAt: new Date("2045-03-20T04:00:00.000Z"),
      categoryId: category.rent ?? "",
      paymentMethod: "bank",
      source: "by_hand",
      sourceId: id,
      purseVentureId: venture.id,
      approval: "approved",
      recordedByRole: "owner",
      recordedAt: new Date("2045-03-20T04:00:00.000Z"),
    });
});

describe("the Overhead", () => {
  it("is what the place and the people cost, by Category, and a head a day over every animal here", async () => {
    const owner = await as("owner", "2045-04-05T04:00:00.000Z");
    const { overheads } = await owner.client.costs.bySide(MARCH);
    expect(overheads).toEqual({
      totalMoney: 31_000,
      lines: [
        expect.objectContaining({ categoryEn: "Shed rent", amount: 18_000 }),
        expect.objectContaining({ categoryEn: "Wages", amount: 12_000 }),
        expect.objectContaining({ categoryBn: "মাছি স্প্রে", amount: 1000 }),
      ],
      // The Venture's bull counts: the same people and sheds keep him.
      headDays: 62,
      perHeadPerDayMoney: 500,
    });
  });

  it("is not carried by either Side", async () => {
    const owner = await as("owner", "2045-04-05T04:00:00.000Z");
    const report = await owner.client.costs.bySide(MARCH);
    // The spray the animals carry, and nothing of the rent or the wages.
    expect(report.fattening.herdMoney).toBeCloseTo(3000, 0);
    expect(report.dairy.herdMoney).toBe(0);
  });

  it("is on Month by month, worked over the month, and the year over the year", async () => {
    const owner = await as("owner", "2045-04-05T04:00:00.000Z");
    const { months, year } = await owner.client.home.byMonth();
    const march = months.find((one) => one.month === "2045-03");
    expect(march?.overheads).toEqual({
      amount: 31_000,
      perHeadPerDayMoney: 500,
    });
    // The year is over every head-day up to now and not the rest of April: March's 62, and two bulls for the four days
    // and ten hours of April so far — 70⅚ in all.
    expect(year.overheads).toEqual({
      amount: 31_000,
      perHeadPerDayMoney: 437.65,
    });
  });
});
