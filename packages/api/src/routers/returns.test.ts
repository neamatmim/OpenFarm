import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// What the money in the Farm's own cattle returned, for the Owner: each Season worked as a Settlement is, the dead in.
//
// Worked by hand. Three bulls aimed at Eid-ul-Adha 2028 (6 May, the table's day):
// - A, bought on 1 January for ৳1,00,000 with ৳1,000 of Hasil, sold at Eid on 6 May for ৳1,60,000;
// - B, bought on 1 February for ৳80,000, sold early on 1 March for ৳90,000;
// - C, bought on 1 January for ৳60,000, dead on 15 February.
// The Season cost ৳2,41,000 and brought back ৳2,50,000: ৳9,000, 3.7 on every hundred. Its money was out
// 1,01,000 × 126 + 80,000 × 29 + 60,000 × 45 = 1,77,46,000 taka-days, 73.6 days on average, and 3.734 × 365 ÷ 73.63
// is 18.5 a year.

const suffix = `${Date.now()}`.slice(-7);
const EID_2028 = { start: "2028-05-06", end: "2028-05-08" };

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const buyer = {
  name: `কাদের কসাই ${suffix}`,
  address: "গাবতলী, ঢাকা",
  phone: "+8801711000056",
};

const sell = async (tagNumber: string, on: string, priceBdt: number) => {
  const { client } = await as("manager", `${on}T00:00:00.000Z`);
  await client.sale.record({
    tagNumber,
    buyer,
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceBdt,
    weightKg: 300,
  });
};

beforeAll(async () => {
  const { client: owner } = await as("owner", "2027-12-31T04:00:00.000Z");
  const shed = await owner.herd.createShed({ name: `ফল ${suffix}` });
  const pen = await owner.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });
  const bought = async (on: string, purchasePriceBdt: number, hasilBdt = 0) => {
    const { client } = await as("manager", `${on}T00:00:00.000Z`);
    return await client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt,
      hasilBdt,
      weightKg: 220,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${on}T00:00:00Z`),
      targetWindowStart: EID_2028.start,
      targetWindowEnd: EID_2028.end,
    });
  };
  const a = await bought("2028-01-01", 100_000, 1000);
  const b = await bought("2028-02-01", 80_000);
  const c = await bought("2028-01-01", 60_000);
  await sell(b.tagNumber, "2028-03-01", 90_000);
  const { client: finding } = await as("manager", "2028-02-15T06:00:00.000Z");
  await finding.animals.recordMortality({
    photo: A_DEATH_PHOTO,
    tagNumber: c.tagNumber,
    kind: "died",
    cause: "পেট ফুলে গিয়েছিল",
    disposal: "buried",
    happenedAt: new Date("2028-02-15T00:00:00Z"),
  });
  await sell(a.tagNumber, "2028-05-06", 160_000);

  // Two bulls for Eid 2029 (25 April by the table), one still aimed at the day expected and one brought along to a day
  // announced later — one Season — and both still standing.
  const forEid2029 = async (start: string, end: string) => {
    const { client } = await as("manager", "2028-10-01T00:00:00.000Z");
    await client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 70_000,
      weightKg: 200,
      estimatedAgeMonths: 18,
      arrivedAt: new Date("2028-10-01T00:00:00Z"),
      targetWindowStart: start,
      targetWindowEnd: end,
    });
  };
  await forEid2029("2029-04-25", "2029-04-27");
  await forEid2029("2029-04-26", "2029-04-28");

  // A winter market that is no Eid: one bull, bought on 1 November for ৳1,00,000 and sold 45 days on for ৳1,08,000 —
  // 8 on every hundred, too short a time to put a year at the farm's 60 days.
  const { client: winter } = await as("manager", "2028-11-01T00:00:00.000Z");
  const w = await winter.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 250,
    estimatedAgeMonths: 24,
    arrivedAt: new Date("2028-11-01T00:00:00Z"),
    targetWindowStart: "2028-12-15",
    targetWindowEnd: "2029-01-15",
  });
  await sell(w.tagNumber, "2028-12-16", 108_000);
});

describe("what a Season of the Farm's own cattle returned", () => {
  it("works it as a Settlement is — the early sale and the dead in — and puts it a year", async () => {
    const { client: owner } = await as("owner", "2028-06-01T04:00:00.000Z");
    const page = await owner.returns.page();
    const season = page.seasons.find((one) => one.key === "eid:2028-05-06");
    expect(season).toMatchObject({
      eid: "2028-05-06",
      finished: true,
      head: 3,
      died: 1,
      returnOnCost: {
        costBdt: 241_000,
        backBdt: 250_000,
        resultBdt: 9000,
        per100: 3.7,
        averageDays: 74,
        perYear: 18.5,
      },
    });
  });
});

describe("which Seasons there are", () => {
  it("makes one Season of an Eid whichever of its days a bull carries, and says it is not finished while one stands", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    const eid2029 = seasons.filter((one) => one.eid === "2029-04-25");
    expect(eid2029).toHaveLength(1);
    expect(eid2029[0]).toMatchObject({
      head: 2,
      finished: false,
      // Not a result while a bull stands: what it is making now is its running range.
      returnOnCost: null,
    });
  });

  it("makes a window that is no Eid a Season of its own, named by its dates", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    expect(
      seasons.find((one) => one.key === "window:2028-12-15|2029-01-15")
    ).toMatchObject({ eid: null, head: 1, finished: true });
  });
});

describe("the floor under a rate a year", () => {
  it("puts no year on money out fewer days than the Owner's floor, and does once the Owner lowers it", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    // Asked afresh each time, as each request reads the farm's Parameters as they then stand.
    const winter = async () => {
      const { client: asking } = await as("owner", "2029-01-10T04:00:00.000Z");
      const { seasons } = await asking.returns.page();
      return seasons.find((one) => one.key === "window:2028-12-15|2029-01-15")
        ?.returnOnCost;
    };
    expect(await winter()).toMatchObject({
      per100: 8,
      averageDays: 45,
      perYear: null,
    });
    try {
      await owner.farm.setParameters({ returnYearFloorDays: 45 });
      // 8 × 365 ÷ 45.
      const lowered = await winter();
      expect(lowered?.perYear).toBe(64.9);
    } finally {
      await owner.farm.setParameters({ returnYearFloorDays: 60 });
    }
  });

  it("is the Owner's alone to set", async () => {
    const { client: manager } = await as("manager", "2029-01-10T04:00:00.000Z");
    await expect(
      manager.farm.setParameters({ returnYearFloorDays: 30 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("whose the Returns page is", () => {
  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager", "2029-01-10T04:00:00.000Z");
    await expect(manager.returns.page()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("the Bank Rate beside a rate a year", () => {
  it("shows none while the Owner has typed none", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons, bankRates } = await owner.returns.page();
    expect(bankRates).toEqual([]);
    expect(
      seasons.find((one) => one.key === "eid:2028-05-06")?.bankRate
    ).toBeNull();
  });

  it("reads the rate in force on the day a Season's first taka went in, the later of two typed for one day", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    // Two for 1 July 2027 typed in the same moment — the second puts the first right — and one from 1 March 2028,
    // after the Eid 2028 Season's first bull came on 1 January.
    await owner.returns.setBankRate({
      perYear: 8.5,
      note: `IBBL ১২ মাসের মুদারাবা ${suffix}`,
      fromDay: "2027-07-01",
    });
    await owner.returns.setBankRate({
      perYear: 8.75,
      note: `IBBL ১২ মাসের মুদারাবা, চূড়ান্ত ${suffix}`,
      fromDay: "2027-07-01",
    });
    await owner.returns.setBankRate({
      perYear: 9.2,
      note: `IBBL ১২ মাসের মুদারাবা, ২০২৮ ${suffix}`,
      fromDay: "2028-03-01",
    });
    const { client: reading } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons, bankRates } = await reading.returns.page();
    expect(
      seasons.find((one) => one.key === "eid:2028-05-06")?.bankRate
    ).toEqual({
      perYear: 8.75,
      note: `IBBL ১২ মাসের মুদারাবা, চূড়ান্ত ${suffix}`,
      fromDay: "2027-07-01",
    });
    // Nothing beside a Season that has no rate a year: the winter one was out fewer days than the floor.
    expect(
      seasons.find((one) => one.key === "window:2028-12-15|2029-01-15")
        ?.bankRate
    ).toBeNull();
    // Every rate kept, the newest first.
    expect(bankRates.map((one) => one.perYear)).toEqual([9.2, 8.75, 8.5]);
  });

  it("refuses a rate outside nought to a hundred, or from a day still to come", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    await expect(
      owner.returns.setBankRate({
        perYear: 101,
        note: "ভুল",
        fromDay: "2029-01-01",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.returns.setBankRate({
        perYear: -1,
        note: "ভুল",
        fromDay: "2029-01-01",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.returns.setBankRate({
        perYear: 9,
        note: "আগামী",
        fromDay: "2029-02-01",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "bank_rate_from_the_future" },
    });
  });

  it("is the Owner's alone to type", async () => {
    const { client: manager } = await as("manager", "2029-01-10T04:00:00.000Z");
    await expect(
      manager.returns.setBankRate({
        perYear: 9,
        note: "ম্যানেজার",
        fromDay: "2029-01-01",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a Season still going, at today's price", () => {
  it("leaves out whole, and names, every bull it cannot value — here all of them, with no price a kilo set", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    const going = seasons.find((one) => one.eid === "2029-04-25");
    expect(going?.running).toBeNull();
    expect(going?.gaps).toHaveLength(2);
    expect(going?.gaps.every((one) => one.why === "no_price")).toBe(true);
  });

  it("values each standing bull as the animal prices do, low and high, and puts no year on it", async () => {
    // Two bulls of 200 kg bought for ৳70,000 each on 1 October 2028; the market at ৳500–600 a kilo makes each ৳1,00,000
    // to ৳1,20,000 today. ৳1,40,000 spent against ৳2,00,000 is 42.9 on every hundred; against ৳2,40,000, 71.4. The
    // money has been out since 1 October: 101 days on 10 January.
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    await owner.fattening.setMarketPrice({
      lowBdtPerKg: 500,
      highBdtPerKg: 600,
    });
    const { client: reading } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons } = await reading.returns.page();
    const going = seasons.find((one) => one.eid === "2029-04-25");
    expect(going?.gaps).toEqual([]);
    expect(going?.running).toEqual({
      soldCostBdt: 0,
      soldResultBdt: 0,
      standingCostBdt: 140_000,
      standingLowBdt: 200_000,
      standingHighBdt: 240_000,
      low: {
        costBdt: 140_000,
        backBdt: 200_000,
        resultBdt: 60_000,
        per100: 42.9,
        averageDays: 101,
        perYear: null,
      },
      high: {
        costBdt: 140_000,
        backBdt: 240_000,
        resultBdt: 100_000,
        per100: 71.4,
        averageDays: 101,
        perYear: null,
      },
    });
  });

  it("gives the Fattening board the Seasons still going, and none finished", async () => {
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    const going = await owner.returns.runningSeasons();
    expect(going.map((one) => one.eid)).toEqual(["2029-04-25"]);
  });

  it("is the Owner's alone on the board too", async () => {
    const { client: manager } = await as("manager", "2029-01-10T04:00:00.000Z");
    await expect(manager.returns.runningSeasons()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("a Season still going with one bull sold and one standing", () => {
  const EID_2030 = { start: "2030-04-14", end: "2030-04-16" };

  beforeAll(async () => {
    // Two bulls of 200 kg bought for ৳70,000 each on 1 January 2029, fed for Eid 2030. One sold on the 5th for
    // ৳90,000; one standing, worth ৳1,00,000 to ৳1,20,000 at the market's ৳500–600 a kilo.
    const { client: owner } = await as("owner", "2029-01-01T00:00:00.000Z");
    await owner.fattening.setMarketPrice({
      lowBdtPerKg: 500,
      highBdtPerKg: 600,
    });
    const shed = await owner.herd.createShed({ name: `২০৩০ ${suffix}` });
    const pen = await owner.herd.createPen({
      quarantine: true,
      shedId: shed.id,
      name: `মোটাতাজা ২০৩০ ${suffix}`,
    });
    const { client: manager } = await as("manager", "2029-01-01T00:00:00.000Z");
    const bull = async () =>
      await manager.intake.record({
        penId: pen.id,
        sex: "male",
        seller: { name: `ব্যাপারী ${suffix}` },
        purchasePriceBdt: 70_000,
        weightKg: 200,
        estimatedAgeMonths: 18,
        arrivedAt: new Date("2029-01-01T00:00:00Z"),
        targetWindowStart: EID_2030.start,
        targetWindowEnd: EID_2030.end,
      });
    await bull();
    const sold = await bull();
    await sell(sold.tagNumber, "2029-01-05", 90_000);
  });

  it("puts the part sold, a fact, beside the part standing at today's price", async () => {
    // ৳1,40,000 spent, ৳90,000 back from the one sold and ৳1,00,000 to ৳1,20,000 standing: 35.7 to 50.0 on every
    // hundred. The money: ৳70,000 out 4 days and ৳70,000 out 9.17 days by 10 January, 6.6 days on average.
    const { client: owner } = await as("owner", "2029-01-10T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    const going = seasons.find((one) => one.eid === "2030-04-14");
    expect(going?.gaps).toEqual([]);
    expect(going?.running).toEqual({
      soldCostBdt: 70_000,
      soldResultBdt: 20_000,
      standingCostBdt: 70_000,
      standingLowBdt: 100_000,
      standingHighBdt: 120_000,
      low: {
        costBdt: 140_000,
        backBdt: 190_000,
        resultBdt: 50_000,
        per100: 35.7,
        averageDays: 7,
        perYear: null,
      },
      high: {
        costBdt: 140_000,
        backBdt: 210_000,
        resultBdt: 70_000,
        per100: 50,
        averageDays: 7,
        perYear: null,
      },
    });
  });
});
