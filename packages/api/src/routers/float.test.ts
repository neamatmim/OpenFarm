import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Buying Float: money drawn from a Venture Account for one trip to the livestock market, so the Manager goes
 * with money that is accounted for — and so the Running Budget is not spent on one more bull.
 */
const suffix = `float-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2046-12-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceMoney: 50_000,
  units: 20,
  /** Three quarters for cattle, a quarter to keep them. */
  cattleBudgetMoney: 750_000,
};

const paper = {
  investorsPercent: 60,
  arbitrator: `মাওলানা ${suffix}`,
  stampValueMoney: 300,
  stampedOn: "2046-12-02",
  stampSerial: `AA ${suffix}`,
};

const photo = { contentType: "image/jpeg" as const, data: "aGVsbG8=" };

type Owner = Awaited<ReturnType<typeof as>>;

/** A Venture with capital in it, buying. */
const funded = async (owner: Owner, which: number, capitalMoney: number) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0191${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: capitalMoney / plan.unitPriceMoney,
    ...paper,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    ...photo,
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: capitalMoney,
    movedOn: "2046-12-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

/** One outing the farm wrote up. */
const outing = async (owner: Owner, which: number) => {
  const trip = await owner.client.buyingTrips.record({
    wentTo: `হাট ${which} ${suffix}`,
    wentOn: "2046-12-05",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  return trip.id;
};

let ventureId = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner", "2046-12-01T04:00:00.000Z");
  ventureId = await funded(owner, 1, 800_000);
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
});

describe("the Buying Float", () => {
  it("goes out to one outing, and comes off the Cattle Budget alone", async () => {
    const owner = await as("owner", "2046-12-05T04:00:00.000Z");
    const trip = await outing(owner, 1);
    const ventures = await owner.client.ventures.list();
    const before = ventures.find((one) => one.id === ventureId);
    // Eight lakh in, three quarters of it for cattle.
    expect(before).toMatchObject({
      balanceMoney: 800_000,
      cattleBudgetHeldMoney: 600_000,
      runningBudgetHeldMoney: 200_000,
      spentMoney: 0,
    });

    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip,
      amountMoney: 500_000,
      movedOn: "2046-12-05",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-1`,
    });

    const afterwards = await owner.client.ventures.list();
    const after = afterwards.find((one) => one.id === ventureId);
    // The money that keeps the animals is untouched: a Float is cattle money.
    expect(after).toMatchObject({
      balanceMoney: 300_000,
      cattleBudgetHeldMoney: 100_000,
      runningBudgetHeldMoney: 200_000,
      spentMoney: 500_000,
    });
  });

  it("is refused for more than the Cattle Budget is holding", async () => {
    const owner = await as("owner", "2046-12-06T04:00:00.000Z");
    const trip = await outing(owner, 2);
    // A lakh is left of the cattle money, whatever the account still holds.
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountMoney: 150_000,
        movedOn: "2046-12-06",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-2`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "cattle_budget_short" },
    });
  });

  it("is refused twice for one outing", async () => {
    const owner = await as("owner", "2046-12-07T04:00:00.000Z");
    const trip = await outing(owner, 3);
    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip,
      amountMoney: 50_000,
      movedOn: "2046-12-07",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-3`,
    });
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountMoney: 10_000,
        movedOn: "2046-12-07",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-3b`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_already_drawn" },
    });
  });

  it("is refused unless the Venture is buying, and refused in cash", async () => {
    const owner = await as("owner", "2046-12-08T04:00:00.000Z");
    const notYet = await owner.client.ventures.open({
      name: `এখনো খোলা ${suffix}`,
      ...plan,
    });
    const trip = await outing(owner, 4);
    await expect(
      owner.client.ventures.drawFloat({
        ventureId: notYet.id,
        buyingTripId: trip,
        amountMoney: 1000,
        movedOn: "2046-12-08",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-4`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountMoney: 1000,
        movedOn: "2046-12-08",
        paymentMethod: "cash",
        reference: "হাতে হাতে",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is refused for an outing bringing another Venture's animals home", async () => {
    const owner = await as("owner", "2046-12-11T04:00:00.000Z");
    const other = await funded(owner, 2, 200_000);
    const trip = await outing(owner, 7);
    // The other Venture's bull comes home on this lorry, on that Venture's own Float.
    await owner.client.ventures.drawFloat({
      ventureId: other,
      buyingTripId: trip,
      amountMoney: 60_000,
      movedOn: "2046-12-11",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-other`,
    });
    const manager = await as("manager", "2046-12-11T05:00:00.000Z");
    await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 50_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      buyingTripId: trip,
      ventureId: other,
      arrivedAt: new Date("2046-12-11T05:00:00.000Z"),
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
    });
    // Money and animals pointing at different Ventures is a sum nobody could make balance.
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountMoney: 10_000,
        movedOn: "2046-12-11",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-7`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("never reaches the Farm's register", async () => {
    const owner = await as("owner", "2046-12-09T04:00:00.000Z");
    const money = await owner.client.money.list({
      from: "2046-12-01",
      to: "2046-12-31",
    });
    // A Float is the Venture's own money moving, not the Farm's income or its cost.
    expect(money.events).toEqual([]);
  });

  it("is the Manager's to see and the Owner's to draw", async () => {
    const owner = await as("owner", "2046-12-10T04:00:00.000Z");
    const trip = await outing(owner, 5);
    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip,
      amountMoney: 40_000,
      movedOn: "2046-12-10",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-5`,
    });

    const manager = await as("manager", "2046-12-10T05:00:00.000Z");
    // She is taking it to the livestock market, so she may see what is in her hand.
    await expect(
      manager.client.ventures.floatOf({ buyingTripId: trip })
    ).resolves.toMatchObject({
      amountMoney: 40_000,
      reference: `FLT-${suffix}-5`,
      ventureName: `ভেঞ্চার 1 ${suffix}`,
    });
    // Drawing it is not hers.
    const another = await outing(owner, 6);
    await expect(
      manager.client.ventures.drawFloat({
        ventureId,
        buyingTripId: another,
        amountMoney: 1000,
        movedOn: "2046-12-10",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-6`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("finds a Venture's Float still out, however many outings came after it", async () => {
    // The lately-made list stops at twenty outings. A Float drawn for one older than that has to be
    // counted home all the same — until it is, the run cannot finish buying or settle.
    const owner = await as("owner", "2046-12-20T04:00:00.000Z");
    const longRun = await funded(owner, 50, 500_000);
    const early = await outing(owner, 500);
    await owner.client.ventures.drawFloat({
      ventureId: longRun,
      buyingTripId: early,
      amountMoney: 100_000,
      movedOn: "2046-12-05",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-early`,
    });
    for (let which = 501; which <= 521; which += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one outing after another, as a season of livestock markets is
      await owner.client.buyingTrips.record({
        wentTo: `পরের হাট ${which} ${suffix}`,
        wentOn: "2046-12-10",
        brokerMoney: 0,
        transportMoney: 0,
        keepMoney: 0,
      });
    }

    const lately = await owner.client.buyingTrips.list();
    expect(lately.map((one) => one.id)).not.toContain(early);
    const stillOut = await owner.client.buyingTrips.list({
      openFloatsOf: longRun,
    });
    expect(stillOut.map((one) => one.id)).toEqual([early]);
    expect(stillOut[0]?.float).toMatchObject({
      ventureId: longRun,
      amountMoney: 100_000,
      reconciledAt: null,
    });
  });
});

// What an outing cost beyond the animals comes out of the Float drawn for it: the Float is "the Animals bought, plus
// the trip's costs, plus the cash brought back". So that money was the Venture's, and its Money Event is in the
// Venture's purse — never the Farm's income or its cost — as the Animals' prices on the same outing already are.
describe("an outing a Float paid for", () => {
  const JANUARY = { from: "2047-01-01", to: "2047-01-31" };
  let paying = "";
  let paidFor = "";

  it("books what it cost to the Venture whose Float paid, though it was written up before the Float went", async () => {
    const owner = await as("owner", "2047-01-10T04:00:00.000Z");
    paying = await funded(owner, 60, 400_000);
    const manager = await as("manager", "2047-01-10T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `ভাড়ার হাট ${suffix}`,
      wentOn: "2047-01-10",
      brokerMoney: 1500,
      transportMoney: 4000,
      keepMoney: 800,
    });
    paidFor = trip.id;
    await owner.client.ventures.drawFloat({
      ventureId: paying,
      buyingTripId: paidFor,
      amountMoney: 50_000,
      movedOn: "2047-01-10",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-paid`,
    });

    const farms = await owner.client.money.list(JANUARY);
    expect(farms.events.map((one) => one.sourceId)).not.toContain(paidFor);
    const its = await owner.client.money.list({
      ...JANUARY,
      ventureId: paying,
    });
    const booked = its.events.find((one) => one.sourceId === paidFor);
    expect(booked).toMatchObject({
      source: "buying_trip",
      amountMoney: 6300,
      purse: { id: paying },
    });
    // And the trail says where it was, and where the Float put it.
    const moved = await scratchDb().query.auditEvent.findMany({
      where: { entity: "money_event", entityId: booked?.id ?? "" },
      columns: { before: true, after: true },
    });
    expect(moved).toContainEqual({
      before: { purseVentureId: null },
      after: { purseVentureId: paying },
    });
  });

  it("keeps it the Venture's when what it cost is put right", async () => {
    const manager = await as("manager", "2047-01-11T04:00:00.000Z");
    await manager.client.buyingTrips.correct({
      id: paidFor,
      reason: "লরির ভাড়া বেশি ছিল",
      changes: { transportMoney: { from: 4000, to: 4500 } },
    });

    const owner = await as("owner", "2047-01-11T04:00:00.000Z");
    const farms = await owner.client.money.list(JANUARY);
    expect(farms.events.map((one) => one.sourceId)).not.toContain(paidFor);
    const its = await owner.client.money.list({
      ...JANUARY,
      ventureId: paying,
    });
    expect(its.events.find((one) => one.sourceId === paidFor)).toMatchObject({
      amountMoney: 6800,
      purse: { id: paying },
    });
  });

  it("is booked to the Venture from the start when it cost nothing until after the Float went", async () => {
    const owner = await as("owner", "2047-01-12T04:00:00.000Z");
    const written = await owner.client.buyingTrips.record({
      wentTo: `শেষে লেখা হাট ${suffix}`,
      wentOn: "2047-01-12",
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    const trip = written.id;
    await owner.client.ventures.drawFloat({
      ventureId: paying,
      buyingTripId: trip,
      amountMoney: 40_000,
      movedOn: "2047-01-12",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-late`,
    });
    const manager = await as("manager", "2047-01-12T06:00:00.000Z");
    await manager.client.buyingTrips.correct({
      id: trip,
      reason: "লরির ভাড়া লেখা হয়নি",
      changes: { transportMoney: { from: 0, to: 3000 } },
    });

    const farms = await owner.client.money.list(JANUARY);
    expect(farms.events.map((one) => one.sourceId)).not.toContain(trip);
    const its = await owner.client.money.list({
      ...JANUARY,
      ventureId: paying,
    });
    expect(its.events.find((one) => one.sourceId === trip)).toMatchObject({
      amountMoney: 3000,
      purse: { id: paying },
    });
  });

  it("stays the Farm's when no Float paid for it", async () => {
    const manager = await as("manager", "2047-01-13T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `খামারের হাট ${suffix}`,
      wentOn: "2047-01-13",
      brokerMoney: 0,
      transportMoney: 2500,
      keepMoney: 0,
    });

    const owner = await as("owner", "2047-01-13T04:00:00.000Z");
    const farms = await owner.client.money.list(JANUARY);
    expect(farms.events.find((one) => one.sourceId === trip.id)).toMatchObject({
      source: "buying_trip",
      amountMoney: 2500,
      purse: null,
    });
  });
});
