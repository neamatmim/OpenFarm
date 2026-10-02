import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * One purse to an outing: the lorry went on one purse's money, so every animal it brought home is that purse's — a
 * Venture's Float and the Farm's never go on the same one (CONTEXT.md, Buying Float), whichever was there first.
 */
const suffix = `one-purse-${Date.now()}`;
const DAY = "2073-03-05";

const as = (role: "owner" | "manager", instant = `${DAY}T04:00:00.000Z`) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

type Owner = Awaited<ReturnType<typeof as>>;

let ventureId = "";
let penId = "";

/** A Venture with capital in it, buying. */
const funded = async (owner: Owner) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2073-03-01",
    targetWindowStart: "2073-07-01",
    targetWindowEnd: "2073-07-05",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 750_000,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01930000073",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2073-02-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 1_000_000,
    movedOn: "2073-02-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

/** One outing the farm wrote up, with a lorry to pay for. */
const outing = async (owner: Owner, which: string) => {
  const trip = await owner.client.trips.record({
    wentTo: `হাট ${which} ${suffix}`,
    wentOn: DAY,
    brokerBdt: 0,
    transportBdt: 2000,
    keepBdt: 0,
  });
  return trip.id;
};

/** One bull off the lorry: the Venture's when one is named. */
const bull = async (sheet: { buyingTripId?: string; ventureId?: string }) => {
  const manager = await as("manager", `${DAY}T05:00:00.000Z`);
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 50_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(`${DAY}T05:00:00.000Z`),
    targetWindowStart: "2073-07-01",
    targetWindowEnd: "2073-07-05",
    ...sheet,
  });
};

const drawFor = async (owner: Owner, tripId: string, reference: string) =>
  await owner.client.ventures.drawFloat({
    ventureId,
    buyingTripId: tripId,
    amountBdt: 100_000,
    movedOn: DAY,
    paymentMethod: "bank",
    reference: `FLT-${suffix}-${reference}`,
  });

/** The Farm's own Float for an outing: cash from the Owner's hand into the Manager's. */
const farmFloatFor = async (owner: Owner, tripId: string) =>
  await owner.client.cash.handOver({
    from: { userId: thePerson("owner").id },
    to: { userId: thePerson("manager").id },
    amountBdt: 100_000,
    buyingTripId: tripId,
  });

beforeAll(async () => {
  const owner = await as("owner");
  ventureId = await funded(owner);
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
});

describe("one purse to an outing", () => {
  it("refuses a Venture's Float for an outing bringing the Farm's own animals home", async () => {
    const owner = await as("owner");
    const trip = await outing(owner, "farm-first");
    await bull({ buyingTripId: trip });
    await expect(drawFor(owner, trip, "farm-first")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "trip_is_the_farms" },
    });
    // And the lorry stays in the Farm's purse, where the Farm's animals' outing belongs.
    const itsOwn = await owner.client.money.list({
      from: DAY,
      to: DAY,
      ventureId,
    });
    expect(itsOwn.events.map((one) => one.sourceId)).not.toContain(trip);
  });

  it("refuses a Venture's animal on an outing the Farm's Float paid for", async () => {
    const owner = await as("owner");
    const trip = await outing(owner, "farm-floated");
    await farmFloatFor(owner, trip);
    // The outing says whose money it went on, so the Intake sheet can stop offering a Venture.
    const trips = await owner.client.trips.list();
    expect(trips.find((one) => one.id === trip)).toMatchObject({
      farmFloat: true,
    });
    await expect(bull({ buyingTripId: trip, ventureId })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
        data: { refusal: "not_whose_float_bought_her" },
      }
    );
  });

  it("refuses an outing-only Correction that puts the Farm's bull on a Venture's outing", async () => {
    const owner = await as("owner");
    const farms = await outing(owner, "farm-unfloated");
    const theirs = await outing(owner, "venture-floated");
    await drawFor(owner, theirs, "venture-floated");
    const hers = await bull({ buyingTripId: farms });
    const manager = await as("manager", `${DAY}T09:00:00.000Z`);
    await expect(
      manager.client.intake.correct({
        id: hers.intakeId,
        reason: `অন্য লরিতে এসেছিল ${suffix}`,
        changes: { buyingTrip: { from: farms, to: theirs } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_whose_float_bought_her" },
    });
  });

  it("refuses an owner Correction that makes a Farm-floated outing's bull a Venture's", async () => {
    const owner = await as("owner");
    const trip = await outing(owner, "farm-floated-2");
    await farmFloatFor(owner, trip);
    const hers = await bull({ buyingTripId: trip });
    const manager = await as("manager", `${DAY}T09:30:00.000Z`);
    await expect(
      manager.client.intake.correct({
        id: hers.intakeId,
        reason: `ভেঞ্চারের গরু ভেবেছিলাম ${suffix}`,
        changes: { owner: { from: null, to: ventureId } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_whose_float_bought_her" },
    });
  });
});
