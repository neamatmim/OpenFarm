import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// Every finished Season read together, for the Owner judging which livestock market, trader, breed or buying weight
// has returned best over the years. Each line pools its animals from every finished Season, the dead in, and says
// how many Seasons it drew from — a share only, never a rate a year. A Season still going is in no line.
//
// Worked by hand. No feed or charges, so an animal's cost is her price.
// - Eid-ul-Adha 2028 (6 May), all bought 1 January:
//   - A, at the Gabtoli livestock market from Karim, a Sahiwal, ৳1,00,000; sold at Eid for ৳1,30,000.
//   - B, at the farm gate from Rahim, no breed written, ৳1,20,000; dead on 15 February.
//   The Season: ৳2,20,000 → ৳1,30,000, −৳90,000.
// - A winter market (15 December 2028 to 15 January 2029), both bought 1 June at Gabtoli:
//   - C, from Karim, a Sahiwal, ৳80,000; sold 20 December for ৳1,00,000.
//   - D, from Selim, a Sahiwal, ৳1,10,000; sold 20 December for ৳1,20,000.
//   The Season: ৳1,90,000 → ৳2,20,000, +৳30,000.
// - E, bought 1 July for Eid 2029 (25 April), still standing on 1 February 2029: a Season still going, in no line.
// Both finished: ৳4,10,000 → ৳3,50,000, −৳60,000.
// - By trader: Karim (A, C — two Seasons) ৳1,80,000 → ৳2,30,000, +৳50,000, 27.8; Rahim (B — one) −100; Selim
//   (D — one) ৳1,10,000 → ৳1,20,000, 9.1.
// - By livestock market: Gabtoli (A, C, D — two Seasons) ৳2,90,000 → ৳3,50,000, +৳60,000, 20.7; the farm gate (B) −100.

const suffix = `${Date.now()}`.slice(-7);
const EID_2028 = { start: "2028-05-06", end: "2028-05-08" };
const WINTER = { start: "2028-12-15", end: "2029-01-15" };
const EID_2029 = { start: "2029-04-25", end: "2029-04-27" };
const GABTOLI = `গাবতলী ${suffix}`;
const KARIM = `করিম ${suffix}`;
const RAHIM = `রহিম ${suffix}`;
const SELIM = `সেলিম ${suffix}`;
const SAHIWAL = `শাহীওয়াল ${suffix}`;
const READ_ON = "2029-02-01T04:00:00.000Z";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const sell = async (tagNumber: string, priceMoney: number, on: string) => {
  const { client } = await as("manager", `${on}T04:00:00.000Z`);
  await client.sales.record({
    tagNumber,
    buyer: { name: `কাদের কসাই ${suffix}` },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceMoney,
    weightKg: 300,
  });
};

beforeAll(async () => {
  const { client: owner } = await as("owner", "2027-12-31T04:00:00.000Z");
  const shed = await owner.sheds.create({ name: `ভাগ ${suffix}` });
  const pen = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });
  const breed = await owner.breeds.create({ nameBn: SAHIWAL });

  /** A trip to Gabtoli on the day, for those bought there. */
  const toGabtoli = async (on: string) => {
    const { client } = await as("owner", `${on}T00:00:00.000Z`);
    const trip = await client.buyingTrips.record({
      wentTo: GABTOLI,
      wentOn: on,
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    return trip.id;
  };
  const bought = async (one: {
    on: string;
    tripId: string | null;
    seller: string;
    purchasePriceMoney: number;
    sahiwal: boolean;
    window: { start: string; end: string };
  }) => {
    const { client: manager } = await as("manager", `${one.on}T00:00:00.000Z`);
    const intake = await manager.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: one.seller },
      purchasePriceMoney: one.purchasePriceMoney,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${one.on}T00:00:00Z`),
      targetWindowStart: one.window.start,
      targetWindowEnd: one.window.end,
      ...(one.tripId ? { buyingTripId: one.tripId } : {}),
      ...(one.sahiwal ? { breedId: breed.id } : {}),
    });
    return intake.tagNumber;
  };

  const january = await toGabtoli("2028-01-01");
  const a = await bought({
    on: "2028-01-01",
    tripId: january,
    seller: KARIM,
    purchasePriceMoney: 100_000,
    sahiwal: true,
    window: EID_2028,
  });
  const b = await bought({
    on: "2028-01-01",
    tripId: null,
    seller: RAHIM,
    purchasePriceMoney: 120_000,
    sahiwal: false,
    window: EID_2028,
  });
  const { client: finding } = await as("manager", "2028-02-15T06:00:00.000Z");
  await finding.animals.recordMortality({
    photo: A_DEATH_PHOTO,
    tagNumber: b,
    kind: "died",
    cause: "পেট ফুলে গিয়েছিল",
    disposal: "buried",
    happenedAt: new Date("2028-02-15T00:00:00Z"),
  });
  await sell(a, 130_000, "2028-05-06");

  const june = await toGabtoli("2028-06-01");
  const c = await bought({
    on: "2028-06-01",
    tripId: june,
    seller: KARIM,
    purchasePriceMoney: 80_000,
    sahiwal: true,
    window: WINTER,
  });
  const d = await bought({
    on: "2028-06-01",
    tripId: june,
    seller: SELIM,
    purchasePriceMoney: 110_000,
    sahiwal: true,
    window: WINTER,
  });
  await bought({
    on: "2028-07-01",
    tripId: null,
    seller: KARIM,
    purchasePriceMoney: 90_000,
    sahiwal: true,
    window: EID_2029,
  });
  await sell(c, 100_000, "2028-12-20");
  await sell(d, 120_000, "2028-12-20");
});

type By = "livestockMarket" | "trader" | "breed" | "band";

const across = async (by: By) => {
  const { client: owner } = await as("owner", READ_ON);
  return await owner.returns.breakdownAcross({ by });
};

/** A line's name, as a test reads it. */
const nameOf = (line: { kind: string; name?: string }) =>
  line.kind === "named" ? line.name : line.kind;

describe("every finished Season read together", () => {
  it("by trader: each line pooled from every finished Season, saying how many it drew from", async () => {
    const read = await across("trader");
    expect(read.seasons).toBe(2);
    expect(
      read.lines.map((one) => ({
        name: nameOf(one.line),
        seasons: one.seasons,
        head: one.head,
        died: one.died,
        costMoney: one.costMoney,
        backMoney: one.backMoney,
        resultMoney: one.resultMoney,
        per100: one.per100,
      }))
    ).toEqual([
      {
        name: KARIM,
        seasons: 2,
        head: 2,
        died: 0,
        costMoney: 180_000,
        backMoney: 230_000,
        resultMoney: 50_000,
        per100: 27.8,
      },
      {
        name: RAHIM,
        seasons: 1,
        head: 1,
        died: 1,
        costMoney: 120_000,
        backMoney: 0,
        resultMoney: -120_000,
        per100: -100,
      },
      {
        name: SELIM,
        seasons: 1,
        head: 1,
        died: 0,
        costMoney: 110_000,
        backMoney: 120_000,
        resultMoney: 10_000,
        per100: 9.1,
      },
    ]);
  });

  it("by livestock market: Gabtoli across both Seasons, the farm gate in one", async () => {
    const read = await across("livestockMarket");
    expect(
      read.lines.map((one) => ({
        name: nameOf(one.line),
        seasons: one.seasons,
        head: one.head,
        resultMoney: one.resultMoney,
        per100: one.per100,
      }))
    ).toEqual([
      {
        name: GABTOLI,
        seasons: 2,
        head: 3,
        resultMoney: 60_000,
        per100: 20.7,
      },
      {
        name: "none",
        seasons: 1,
        head: 1,
        resultMoney: -120_000,
        per100: -100,
      },
    ]);
  });

  it("adds up, every way it is opened, to the finished Seasons on the page — and leaves the one still going out", async () => {
    const { client: owner } = await as("owner", READ_ON);
    const { seasons } = await owner.returns.list();
    const finished = seasons.filter((one) => one.finished);
    expect(finished).toHaveLength(2);
    const total = {
      costMoney: finished.reduce(
        (sum, one) => sum + (one.returnOnCost?.costMoney ?? 0),
        0
      ),
      resultMoney: finished.reduce(
        (sum, one) => sum + (one.returnOnCost?.resultMoney ?? 0),
        0
      ),
    };
    expect(total).toEqual({ costMoney: 410_000, resultMoney: -60_000 });
    for (const by of ["livestockMarket", "trader", "breed", "band"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- four ways, read one after the other
      const read = await across(by);
      expect({
        by,
        head: read.lines.reduce((sum, one) => sum + one.head, 0),
        costMoney: read.lines.reduce((sum, one) => sum + one.costMoney, 0),
        resultMoney: read.lines.reduce((sum, one) => sum + one.resultMoney, 0),
      }).toEqual({ by, head: 4, ...total });
    }
  });

  it("says a share on every line, and never a rate a year", async () => {
    for (const by of ["livestockMarket", "trader", "breed", "band"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- four ways, read one after the other
      const read = await across(by);
      for (const one of read.lines) {
        expect(one).not.toHaveProperty("perYear");
        expect(one).not.toHaveProperty("averageDays");
      }
    }
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager", READ_ON);
    await expect(
      manager.returns.breakdownAcross({ by: "trader" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
