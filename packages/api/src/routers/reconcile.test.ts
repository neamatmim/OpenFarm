import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Float counted when the trip comes home: what went out equals the animals it bought, plus the
 * outing's own costs, plus the cash brought back and deposited. Nothing goes missing between the haat
 * and the shed.
 */
const suffix = `home-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2047-01-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 1_000_000,
};

const paper = {
  investorsPercent: 60,
  arbitrator: `মাওলানা ${suffix}`,
  stampValueBdt: 300,
  stampedOn: "2047-01-02",
  stampSerial: `AA ${suffix}`,
};

type Owner = Awaited<ReturnType<typeof as>>;

let ventureId = "";
let penId = "";

/** An outing with its own costs, and a Float drawn for it. */
const outingWithFloat = async (
  owner: Owner,
  which: number,
  floatBdt: number,
  tripCostBdt: number
) => {
  const trip = await owner.client.trips.record({
    wentTo: `হাট ${which} ${suffix}`,
    wentOn: "2047-01-05",
    brokerBdt: tripCostBdt,
    transportBdt: 0,
    keepBdt: 0,
  });
  await owner.client.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: floatBdt,
    movedOn: "2047-01-05",
    paymentMethod: "bank",
    reference: `FLT-${suffix}-${which}`,
  });
  return trip.id;
};

/** One bull off that lorry, bought with the Venture's money. */
const bull = async (
  buyingTripId: string,
  priceBdt: number,
  hasilBdt: number,
  instant: string
) => {
  const manager = await as("manager", instant);
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: priceBdt,
    hasilBdt,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId,
    ventureId,
    arrivedAt: new Date(instant),
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2047-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;

  const venture = await owner.client.ventures.open({
    name: `হাটের ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01912345678",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    ...paper,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 1_000_000,
    movedOn: "2047-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });
});

describe("the Float comes home", () => {
  it("balances against the animals, the outing's costs and the cash back", async () => {
    const owner = await as("owner", "2047-01-05T04:00:00.000Z");
    const trip = await outingWithFloat(owner, 1, 200_000, 5000);
    await bull(trip, 80_000, 2000, "2047-01-05T06:00:00.000Z");
    await bull(trip, 100_000, 3000, "2047-01-05T07:00:00.000Z");
    // 185,000 of animals and 5,000 of lorry and broker, so 10,000 comes home.
    const counted = await owner.client.ventures.reconcileFloat({
      buyingTripId: trip,
      cashBackBdt: 10_000,
      movedOn: "2047-01-06",
      reference: `DEP-${suffix}-1`,
    });
    expect(counted).toMatchObject({
      animalsBdt: 185_000,
      tripBdt: 5000,
      cashBackBdt: 10_000,
      animals: 2,
    });

    const ventures = await owner.client.ventures.list();
    const venture = ventures.find((one) => one.id === ventureId);
    // The ten thousand is back in the bank, and it is cattle money again.
    expect(venture).toMatchObject({
      openFloatBdt: 0,
      spentBdt: 190_000,
      balanceBdt: 810_000,
      cattleBudgetHeldBdt: 810_000,
    });
  });

  it("refuses a count that is short, and one that is over", async () => {
    const owner = await as("owner", "2047-01-07T04:00:00.000Z");
    const trip = await outingWithFloat(owner, 2, 100_000, 0);
    await bull(trip, 60_000, 0, "2047-01-07T06:00:00.000Z");
    // Sixty thousand of bull and ten back leaves thirty thousand nobody can account for.
    await expect(
      owner.client.ventures.reconcileFloat({
        buyingTripId: trip,
        cashBackBdt: 10_000,
        movedOn: "2047-01-08",
        reference: `DEP-${suffix}-2a`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      // Thirty thousand nobody can account for, and the refusal says which way.
      data: { refusal: "float_short", gapBdt: 30_000 },
    });
    // And more back than went out is just as wrong.
    await expect(
      owner.client.ventures.reconcileFloat({
        buyingTripId: trip,
        cashBackBdt: 50_000,
        movedOn: "2047-01-08",
        reference: `DEP-${suffix}-2b`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_over", gapBdt: 10_000 },
    });
  });

  it("leaves an unreconciled Float open on the Venture", async () => {
    const owner = await as("owner", "2047-01-09T04:00:00.000Z");
    const before = await owner.client.ventures.list();
    const wasOut =
      before.find((one) => one.id === ventureId)?.openFloatBdt ?? 0;
    await outingWithFloat(owner, 9, 25_000, 0);
    const after = await owner.client.ventures.list();
    // Money the farm has let go of and not yet counted is money the Venture is told about.
    expect(after.find((one) => one.id === ventureId)?.openFloatBdt).toBe(
      wasOut + 25_000
    );
  });

  it("is counted once and not again", async () => {
    const owner = await as("owner", "2047-01-10T04:00:00.000Z");
    const trip = await outingWithFloat(owner, 3, 50_000, 0);
    await bull(trip, 50_000, 0, "2047-01-10T06:00:00.000Z");
    await owner.client.ventures.reconcileFloat({
      buyingTripId: trip,
      cashBackBdt: 0,
    });
    await expect(
      owner.client.ventures.reconcileFloat({
        buyingTripId: trip,
        cashBackBdt: 0,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_already_reconciled" },
    });
  });

  it("takes no animal and no cost after it has been counted", async () => {
    const owner = await as("owner", "2047-01-11T04:00:00.000Z");
    const trip = await outingWithFloat(owner, 4, 70_000, 0);
    await bull(trip, 70_000, 0, "2047-01-11T06:00:00.000Z");
    await owner.client.ventures.reconcileFloat({
      buyingTripId: trip,
      cashBackBdt: 0,
    });
    // An animal written up late would falsify a sum the Owner has already signed.
    await expect(
      bull(trip, 40_000, 0, "2047-01-11T08:00:00.000Z")
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_already_reconciled" },
    });
    // And so would the lorry turning out to have cost more.
    const manager = await as("manager", "2047-01-11T09:00:00.000Z");
    await expect(
      manager.client.trips.correct({
        id: trip,
        reason: "লরির ভাড়া বেশি ছিল",
        changes: { transportBdt: { from: 0, to: 4000 } },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("takes no animal off a counted outing, nor one bought on another purse's money", async () => {
    const owner = await as("owner", "2047-01-13T04:00:00.000Z");
    const trip = await outingWithFloat(owner, 6, 60_000, 0);
    // The lorry went out on this Venture's money, so every beast on it is this Venture's.
    const manager = await as("manager", "2047-01-13T05:00:00.000Z");
    await expect(
      manager.client.intake.record({
        penId,
        sex: "male",
        seller: { name: `ব্যাপারী ${suffix}` },
        purchasePriceBdt: 60_000,
        weightKg: 200,
        estimatedAgeMonths: 20,
        buyingTripId: trip,
        arrivedAt: new Date("2047-01-13T05:00:00.000Z"),
        targetWindowStart: "2047-05-17",
        targetWindowEnd: "2047-05-19",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_whose_float_bought_her" },
    });

    // And once it is counted, her price may not be put right either: the sum was signed against it.
    const her = await bull(trip, 60_000, 0, "2047-01-13T06:00:00.000Z");
    await owner.client.ventures.reconcileFloat({
      buyingTripId: trip,
      cashBackBdt: 0,
    });
    const later = await as("manager", "2047-01-13T08:00:00.000Z");
    await expect(
      later.client.intake.correct({
        id: her.intakeId,
        reason: "দাম ভুল লেখা হয়েছিল",
        changes: { purchasePriceBdt: { from: 60_000, to: 55_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_already_reconciled" },
    });
  });

  it("needs the slip when cash comes back, and is the Owner's alone", async () => {
    const owner = await as("owner", "2047-01-12T04:00:00.000Z");
    const trip = await outingWithFloat(owner, 5, 60_000, 0);
    await bull(trip, 50_000, 0, "2047-01-12T06:00:00.000Z");
    await expect(
      owner.client.ventures.reconcileFloat({
        buyingTripId: trip,
        cashBackBdt: 10_000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "cash_back_needs_a_slip" },
    });
    const manager = await as("manager", "2047-01-12T07:00:00.000Z");
    await expect(
      manager.client.ventures.reconcileFloat({
        buyingTripId: trip,
        cashBackBdt: 10_000,
        movedOn: "2047-01-12",
        reference: `DEP-${suffix}-5`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
