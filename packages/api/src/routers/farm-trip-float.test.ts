import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Buying Float for one of the Farm's own outings: the Owner hands the Manager cash before the livestock market, and counts it
// home against the animals the outing bought, their Market toll, its costs and the cash brought back, to the taka.

const suffix = `farm-float-${Date.now()}`;
const NOW = "2072-02-10T04:00:00.000Z";

const as = (role: "owner" | "manager", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let tripId = "";
let penId = "";

const handOf = async (role: "owner" | "manager") => {
  const owner = await as("owner");
  const hands = await owner.client.cash.inHand();
  return hands.find((one) => one.userId === thePerson(role).id)?.amount ?? 0;
};

beforeAll(async () => {
  const owner = await as("owner");
  const manager = await as("manager");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // The outing, and the ৳1,00,000 the Owner hands the Manager for it.
  const trip = await manager.client.buyingTrips.record({
    wentTo: `গাবতলী হাট ${suffix}`,
    brokerMoney: 2000,
    transportMoney: 3000,
    wentOn: new Date(NOW),
  });
  tripId = trip.id;
  await owner.client.cash.handOver({
    from: { userId: thePerson("owner").id },
    to: { userId: thePerson("manager").id },
    amountMoney: 100_000,
    buyingTripId: tripId,
  });
  // Two bulls bought on it, paid in cash out of the Manager's hand.
  for (const [price, name] of [
    [40_000, "ক"],
    [45_000, "খ"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one lorry, one bull after the other
    await manager.client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${name} ${suffix}` },
      purchasePriceMoney: price,
      marketTollMoney: 500,
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
  it("is open, bought against the animals, their Market toll and the outing's costs", async () => {
    const manager = await as("manager");
    const floats = await manager.client.cash.tripFloats();
    expect(floats.find((one) => one.tripId === tripId)).toMatchObject({
      handedMoney: 100_000,
      // 85,000 for the bulls, 1,000 of Market toll, 5,000 for the broker and the lorry.
      boughtMoney: 91_000,
      backMoney: 0,
      carrierId: thePerson("manager").id,
    });
  });

  it("is refused short or over, with the gap", async () => {
    const owner = await as("owner");
    await expect(
      owner.client.cash.countFloatHome({ tripId, cashBackMoney: 8000 })
    ).rejects.toMatchObject({
      data: { refusal: "float_short", gapMoney: 1000 },
    });
    await expect(
      owner.client.cash.countFloatHome({ tripId, cashBackMoney: 10_000 })
    ).rejects.toMatchObject({
      data: { refusal: "float_over", gapMoney: 1000 },
    });
  });

  it("is the Owner's to count home", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.cash.countFloatHome({ tripId, cashBackMoney: 9000 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts home to the taka, the cash back in the Owner's hand and the carrier's hand empty", async () => {
    const ownerBefore = await handOf("owner");
    const owner = await as("owner");
    await owner.client.cash.countFloatHome({ tripId, cashBackMoney: 9000 });
    expect(await handOf("owner")).toBe(ownerBefore + 9000);
    expect(await handOf("manager")).toBe(0);
    const manager = await as("manager");
    const floats = await manager.client.cash.tripFloats();
    expect(floats.map((one) => one.tripId)).not.toContain(tripId);
    // And the outing says so, so the Intake sheet stops offering it.
    const trips = await manager.client.buyingTrips.list();
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
        amountMoney: 1000,
        buyingTripId: tripId,
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });

  it("takes no further animal once counted home", async () => {
    const manager = await as("manager", "2072-02-11T05:00:00.000Z");
    await expect(
      manager.client.intakes.record({
        penId,
        sex: "male",
        seller: { name: `ব্যাপারী গ ${suffix}` },
        purchasePriceMoney: 42_000,
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
      manager.client.buyingTrips.correct({
        id: tripId,
        reason: `লরির ভাড়া আসলে বেশি ছিল ${suffix}`,
        changes: { transportMoney: { from: 3000, to: 5000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });

  it("takes no animal moved onto it by a Correction once counted home", async () => {
    const manager = await as("manager", "2072-02-11T07:00:00.000Z");
    // A bull bought at the farm gate the same week, then said to have come home on the counted outing.
    const hers = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `প্রতিবেশী ${suffix}` },
      purchasePriceMoney: 38_000,
      weightKg: 230,
      estimatedAgeMonths: 18,
      arrivedAt: new Date("2072-02-11T07:00:00.000Z"),
      targetWindowStart: "2072-06-01",
      targetWindowEnd: "2072-06-05",
    });
    await expect(
      manager.client.intakes.correct({
        id: hers.intakeId,
        reason: `এটাও গাবতলীর লরিতে এসেছিল ${suffix}`,
        changes: { buyingTrip: { from: null, to: tripId } },
      })
    ).rejects.toMatchObject({ data: { refusal: "float_already_reconciled" } });
  });
});

describe("a Farm float's count taken back", () => {
  it("opens the float again: the cash back leaves the Owner's hand for the carrier's, and it is counted afresh", async () => {
    const owner = await as("owner");
    const ownerBefore = await handOf("owner");
    const managerBefore = await handOf("manager");
    await owner.client.cash.uncountFloat({
      tripId,
      reason: "নয় হাজার নয়, আট হাজার ফেরত এসেছিল",
    });
    expect(await handOf("owner")).toBe(ownerBefore - 9000);
    expect(await handOf("manager")).toBe(managerBefore + 9000);
    const manager = await as("manager");
    const floats = await manager.client.cash.tripFloats();
    expect(floats.map((one) => one.tripId)).toContain(tripId);
    // Counted again, to the taka.
    await owner.client.cash.countFloatHome({ tripId, cashBackMoney: 9000 });
    expect(await handOf("owner")).toBe(ownerBefore);
  });
});

describe("a Farm float counted home twice at once", () => {
  it("is counted home once: one count goes through, the other is refused, and the cash back is booked once", async () => {
    const owner = await as("owner", "2072-03-01T04:00:00.000Z");
    const manager = await as("manager", "2072-03-01T04:00:00.000Z");
    // An outing that bought nothing but its lorry: ৳10,000 handed out, ৳1,000 spent, ৳9,000 to come back.
    const trip = await manager.client.buyingTrips.record({
      wentTo: `কাঁচপুর হাট ${suffix}`,
      transportMoney: 1000,
      wentOn: new Date("2072-03-01T04:00:00.000Z"),
    });
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { userId: thePerson("manager").id },
      amountMoney: 10_000,
      buyingTripId: trip.id,
    });
    const ownerBefore = await handOf("owner");
    // Two taps on Count home, from two tabs: sent together on purpose, the race is what is tested.
    const tries = await Promise.allSettled([
      owner.client.cash.countFloatHome({
        tripId: trip.id,
        cashBackMoney: 9000,
      }),
      owner.client.cash.countFloatHome({
        tripId: trip.id,
        cashBackMoney: 9000,
      }),
    ]);
    expect(tries.filter((one) => one.status === "fulfilled")).toHaveLength(1);
    expect(await handOf("owner")).toBe(ownerBefore + 9000);
  });

  it("is either counted home or given more float, never both at once", async () => {
    const owner = await as("owner", "2072-03-02T04:00:00.000Z");
    const manager = await as("manager", "2072-03-02T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `মিরকাদিম হাট ${suffix}`,
      transportMoney: 1000,
      wentOn: new Date("2072-03-02T04:00:00.000Z"),
    });
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { userId: thePerson("manager").id },
      amountMoney: 10_000,
      buyingTripId: trip.id,
    });
    // A second float handed out while the first is counted home, sent together on purpose. Whichever lands first, the
    // other is refused: a float counted home takes no more, and one given more no longer balances at ৳9,000 back.
    const tries = await Promise.allSettled([
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { userId: thePerson("manager").id },
        amountMoney: 5000,
        buyingTripId: trip.id,
      }),
      owner.client.cash.countFloatHome({
        tripId: trip.id,
        cashBackMoney: 9000,
      }),
    ]);
    expect(tries.filter((one) => one.status === "fulfilled")).toHaveLength(1);
  });
});

describe("a Farm float whose outing paid for a bull from an account", () => {
  it("counts only what was paid in cash from the hand", async () => {
    const owner = await as("owner", "2072-03-03T04:00:00.000Z");
    const manager = await as("manager", "2072-03-03T04:00:00.000Z");
    const account = await owner.client.farmAccounts.create({
      kind: "mobile_money",
      name: `বিকাশ ${suffix}`,
      number: "01711000099",
    });
    const trip = await manager.client.buyingTrips.record({
      wentTo: `বিকাশের হাট ${suffix}`,
      transportMoney: 1000,
      wentOn: new Date("2072-03-03T04:00:00.000Z"),
    });
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { userId: thePerson("manager").id },
      amountMoney: 100_000,
      buyingTripId: trip.id,
    });
    // ৳60,000 sent by bKash, not counted out of the notes in the Manager's pocket.
    await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী বিকাশ ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2072-03-03T04:00:00.000Z"),
      buyingTripId: trip.id,
      paymentMethod: "mobile_money",
      farmAccountId: account.id,
      reference: `TXN-${suffix}`,
      targetWindowStart: "2072-06-01",
      targetWindowEnd: "2072-06-05",
    });
    await owner.client.cash.countFloatHome({
      tripId: trip.id,
      cashBackMoney: 99_000,
    });
  });
});

describe("a Farm bull taken in on an outing at the moment its float is counted home", () => {
  it("is either taken in before the count or refused after it, never on a closed float", async () => {
    const owner = await as("owner", "2072-03-04T04:00:00.000Z");
    const manager = await as("manager", "2072-03-04T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `একসাথে হাট ${suffix}`,
      transportMoney: 1000,
      wentOn: new Date("2072-03-04T04:00:00.000Z"),
    });
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { userId: thePerson("manager").id },
      amountMoney: 10_000,
      buyingTripId: trip.id,
    });
    const tries = await Promise.allSettled([
      owner.client.cash.countFloatHome({
        tripId: trip.id,
        cashBackMoney: 9000,
      }),
      manager.client.intakes.record({
        penId,
        sex: "male",
        seller: { name: `ব্যাপারী একসাথে ${suffix}` },
        purchasePriceMoney: 8000,
        weightKg: 120,
        estimatedAgeMonths: 8,
        arrivedAt: new Date("2072-03-04T04:00:00.000Z"),
        buyingTripId: trip.id,
        targetWindowStart: "2072-06-01",
        targetWindowEnd: "2072-06-05",
      }),
    ]);
    expect(tries.filter((one) => one.status === "fulfilled")).toHaveLength(1);
  });
});
