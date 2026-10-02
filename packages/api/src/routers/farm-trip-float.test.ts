import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Buying Float for one of the Farm's own outings: the Owner hands the Manager cash before the haat, and counts it
// home against the animals the outing bought, their Hasil, its costs and the cash brought back, to the taka.

const suffix = `farm-float-${Date.now()}`;
const NOW = "2072-02-10T04:00:00.000Z";

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let tripId = "";
let penId = "";

const handOf = async (role: "owner" | "manager") => {
  const owner = await as("owner");
  const hands = await owner.client.cash.inHand();
  return hands.find((one) => one.userId === thePerson(role).id)?.bdt ?? 0;
};

beforeAll(async () => {
  const owner = await as("owner");
  const manager = await as("manager");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // The outing, and the ৳1,00,000 the Owner hands the Manager for it.
  const trip = await manager.client.trips.record({
    wentTo: `গাবতলী হাট ${suffix}`,
    brokerBdt: 2000,
    transportBdt: 3000,
    wentOn: new Date(NOW),
  });
  tripId = trip.id;
  await owner.client.cash.handOver({
    from: { userId: thePerson("owner").id },
    to: { userId: thePerson("manager").id },
    amountBdt: 100_000,
    buyingTripId: tripId,
  });
  // Two bulls bought on it, paid in cash out of the Manager's hand.
  for (const [price, name] of [
    [40_000, "ক"],
    [45_000, "খ"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one lorry, one bull after the other
    await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${name} ${suffix}` },
      purchasePriceBdt: price,
      hasilBdt: 500,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(NOW),
      buyingTripId: tripId,
      targetWindowStart: "2072-06-01",
      targetWindowEnd: "2072-06-05",
    });
  }
});

describe("a Buying Float for the Farm's own outing", () => {
  it("is open, bought against the animals, their Hasil and the outing's costs", async () => {
    const manager = await as("manager");
    const floats = await manager.client.cash.tripFloats();
    expect(floats.find((one) => one.tripId === tripId)).toMatchObject({
      handedBdt: 100_000,
      // 85,000 for the bulls, 1,000 of Hasil, 5,000 for the broker and the lorry.
      boughtBdt: 91_000,
      backBdt: 0,
      carrierId: thePerson("manager").id,
    });
  });

  it("is refused short or over, with the gap", async () => {
    const owner = await as("owner");
    await expect(
      owner.client.cash.countFloatHome({ tripId, cashBackBdt: 8000 })
    ).rejects.toMatchObject({
      data: { refusal: "float_short", gapBdt: 1000 },
    });
    await expect(
      owner.client.cash.countFloatHome({ tripId, cashBackBdt: 10_000 })
    ).rejects.toMatchObject({
      data: { refusal: "float_over", gapBdt: 1000 },
    });
  });

  it("is the Owner's to count home", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.cash.countFloatHome({ tripId, cashBackBdt: 9000 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts home to the taka, the cash back in the Owner's hand and the carrier's hand empty", async () => {
    const ownerBefore = await handOf("owner");
    const owner = await as("owner");
    await owner.client.cash.countFloatHome({ tripId, cashBackBdt: 9000 });
    expect(await handOf("owner")).toBe(ownerBefore + 9000);
    expect(await handOf("manager")).toBe(0);
    const manager = await as("manager");
    const floats = await manager.client.cash.tripFloats();
    expect(floats.map((one) => one.tripId)).not.toContain(tripId);
    // And the outing says so, so the Intake sheet stops offering it.
    const trips = await manager.client.trips.list();
    expect(trips.find((one) => one.id === tripId)).toMatchObject({
      countedHome: true,
    });
  });

  it("takes no more float once counted home", async () => {
    const owner = await as("owner");
    await expect(
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { userId: thePerson("manager").id },
        amountBdt: 1000,
        buyingTripId: tripId,
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });

  it("takes no further animal once counted home", async () => {
    const manager = await as("manager", "2072-02-11T05:00:00.000Z");
    await expect(
      manager.client.intake.record({
        penId,
        sex: "male",
        seller: { name: `ব্যাপারী গ ${suffix}` },
        purchasePriceBdt: 42_000,
        weightKg: 240,
        estimatedAgeMonths: 20,
        arrivedAt: new Date("2072-02-11T05:00:00.000Z"),
        buyingTripId: tripId,
        targetWindowStart: "2072-06-01",
        targetWindowEnd: "2072-06-05",
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });

  it("takes no change to what it cost once counted home", async () => {
    const manager = await as("manager", "2072-02-11T06:00:00.000Z");
    await expect(
      manager.client.trips.correct({
        id: tripId,
        reason: `লরির ভাড়া আসলে বেশি ছিল ${suffix}`,
        changes: { transportBdt: { from: 3000, to: 5000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });

  it("takes no animal moved onto it by a Correction once counted home", async () => {
    const manager = await as("manager", "2072-02-11T07:00:00.000Z");
    // A bull bought at the farm gate the same week, then said to have come home on the counted outing.
    const hers = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `প্রতিবেশী ${suffix}` },
      purchasePriceBdt: 38_000,
      weightKg: 230,
      estimatedAgeMonths: 18,
      arrivedAt: new Date("2072-02-11T07:00:00.000Z"),
      targetWindowStart: "2072-06-01",
      targetWindowEnd: "2072-06-05",
    });
    await expect(
      manager.client.intake.correct({
        id: hers.intakeId,
        reason: `এটাও গাবতলীর লরিতে এসেছিল ${suffix}`,
        changes: { buyingTrip: { from: null, to: tripId } },
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });
});
