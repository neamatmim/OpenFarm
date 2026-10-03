import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Buying Trip: one outing to buy cattle, with what it cost beyond the animals' prices. The cost is split
 * evenly across the animals that came home on it, because the lorry was hired for all of them.
 */
const suffix = `trips-${Date.now()}`;
const PERIOD = { from: "2041-01-01", to: "2041-01-31" };

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
  });

let penId = "";

const buy = async (
  manager: Awaited<ReturnType<typeof as>>,
  price: number,
  buyingTripId?: string
) => {
  const taken = await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: price,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId,
    // Named rather than defaulted: the farm's Eid table does not reach 2041.
    targetWindowStart: "2041-06-01",
    targetWindowEnd: "2041-06-05",
  });
  return taken;
};

const costOf = async (tagNumber: string) => {
  const owner = await as("owner", "2041-02-01T04:00:00.000Z");
  return await owner.client.costs.ofAnimal({ tagNumber });
};

beforeAll(async () => {
  const owner = await as("owner", "2041-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: "কোয়ারেন্টিন",
  });
  penId = pen.id;
});

describe("a Buying Trip", () => {
  it("splits what the outing cost across the animals that came home on it", async () => {
    const manager = await as("manager", "2041-01-05T04:00:00.000Z");
    // A lorry to Gabtoli and back: 3,000 to the broker, 5,000 for the lorry, 1,000 to keep the men.
    const trip = await manager.client.buyingTrips.record({
      wentTo: `গাবতলী ${suffix}`,
      brokerMoney: 3000,
      transportMoney: 5000,
      keepMoney: 1000,
      paymentMethod: "cash",
    });
    const first = await buy(manager, 50_000, trip.id);
    const second = await buy(manager, 60_000, trip.id);
    const third = await buy(manager, 55_000, trip.id);

    // Nine thousand over three beasts.
    const each = await Promise.all(
      [first, second, third].map((one) => costOf(one.tagNumber))
    );
    for (const one of each) {
      expect(one).toMatchObject({ tripMoney: 3000 });
    }
  });

  it("charges the whole outing to the one animal that came home on it", async () => {
    const manager = await as("manager", "2041-01-06T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `একলা হাট ${suffix}`,
      transportMoney: 4000,
      paymentMethod: "cash",
    });
    const alone = await buy(manager, 45_000, trip.id);
    expect(await costOf(alone.tagNumber)).toMatchObject({ tripMoney: 4000 });
  });

  it("charges nothing to an animal that came home on no Trip", async () => {
    const manager = await as("manager", "2041-01-07T04:00:00.000Z");
    const gate = await buy(manager, 40_000);
    expect(await costOf(gate.tagNumber)).toMatchObject({ tripMoney: 0 });
  });

  it("re-splits when a Correction moves an animal off the Trip", async () => {
    const manager = await as("manager", "2041-01-08T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `ভুল হাট ${suffix}`,
      transportMoney: 6000,
      paymentMethod: "cash",
    });
    const stays = await buy(manager, 50_000, trip.id);
    const leaves = await buy(manager, 50_000, trip.id);
    expect(await costOf(stays.tagNumber)).toMatchObject({ tripMoney: 3000 });

    // He came home on his own legs from the next village, not on that lorry.
    await manager.client.intakes.correct({
      id: leaves.intakeId,
      reason: "এই গরু ওই ট্রিপে আসেনি",
      changes: { buyingTrip: { from: trip.id, to: null } },
    });
    expect(await costOf(leaves.tagNumber)).toMatchObject({ tripMoney: 0 });
    expect(await costOf(stays.tagNumber)).toMatchObject({ tripMoney: 6000 });
  });

  it("puts right what an outing cost, and re-charges the animals at once", async () => {
    const manager = await as("manager", "2041-01-11T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `ভুল ভাড়া ${suffix}`,
      transportMoney: 4000,
      paymentMethod: "cash",
    });
    const first = await buy(manager, 50_000, trip.id);
    const second = await buy(manager, 50_000, trip.id);
    expect(await costOf(first.tagNumber)).toMatchObject({ tripMoney: 2000 });

    // The lorry man's rate was 5,000, not 4,000.
    await manager.client.buyingTrips.correct({
      id: trip.id,
      reason: "গাড়ি ভাড়া ৫,০০০ ছিল",
      changes: { transportMoney: { from: 4000, to: 5000 } },
    });
    expect(await costOf(first.tagNumber)).toMatchObject({ tripMoney: 2500 });
    expect(await costOf(second.tagNumber)).toMatchObject({ tripMoney: 2500 });
    // Listed with each part as it now stands, which is what the screen puts right from.
    const listed = await manager.client.buyingTrips.list();
    expect(listed.find((one) => one.id === trip.id)?.parts).toEqual({
      brokerMoney: 0,
      transportMoney: 5000,
      keepMoney: 0,
    });

    // The same Money Event put right, never a second one.
    const money = await manager.client.money.list({
      from: "2041-01-01",
      to: "2041-01-31",
    });
    expect(money.events.filter((one) => one.sourceId === trip.id)).toEqual([
      expect.objectContaining({ amountMoney: 5000 }),
    ]);
  });

  it("refuses an outing another farm wrote up", async () => {
    const manager = await as("manager", "2041-01-12T04:00:00.000Z");
    await expect(
      buy(manager, 50_000, "a-trip-from-somewhere-else")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a lorry that has not gone yet", async () => {
    const manager = await as("manager", "2041-01-13T04:00:00.000Z");
    await expect(
      manager.client.buyingTrips.record({
        wentTo: `আগামীকাল ${suffix}`,
        transportMoney: 1000,
        wentOn: new Date("2041-02-01T04:00:00.000Z"),
        paymentMethod: "cash",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("charges a Trip that brought nobody home to nobody, and says so", async () => {
    const manager = await as("manager", "2041-01-09T04:00:00.000Z");
    await manager.client.buyingTrips.record({
      wentTo: `খালি হাত ${suffix}`,
      transportMoney: 2500,
      paymentMethod: "cash",
    });
    const owner = await as("owner", "2041-02-01T04:00:00.000Z");
    const report = await owner.client.costs.bySide(PERIOD);
    expect(report.unallocated.tripMoney).toBeGreaterThanOrEqual(2500);

    // And an outing whose only arrival is corrected off it becomes one of those too.
    const emptied = await manager.client.buyingTrips.record({
      wentTo: `সবাই সরানো ${suffix}`,
      transportMoney: 1500,
      paymentMethod: "cash",
    });
    const only = await buy(manager, 50_000, emptied.id);
    expect(await costOf(only.tagNumber)).toMatchObject({ tripMoney: 1500 });
    await manager.client.intakes.correct({
      id: only.intakeId,
      reason: "এই গরু ওই ট্রিপে আসেনি",
      changes: { buyingTrip: { from: emptied.id, to: null } },
    });
    expect(await costOf(only.tagNumber)).toMatchObject({ tripMoney: 0 });
    const after = await owner.client.costs.bySide(PERIOD);
    expect(after.unallocated.tripMoney).toBe(
      report.unallocated.tripMoney + 1500
    );
  });

  it("reaches the farm's money once, and never a second time by hand", async () => {
    const manager = await as("manager", "2041-01-10T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `হিসাবের হাট ${suffix}`,
      brokerMoney: 1200,
      transportMoney: 3800,
      paymentMethod: "bank",
    });
    const money = await manager.client.money.list({
      from: "2041-01-01",
      to: "2041-01-31",
    });
    expect(money.events.filter((one) => one.sourceId === trip.id)).toEqual([
      expect.objectContaining({
        amountMoney: 5000,
        direction: "out",
        paymentMethod: "bank",
      }),
    ]);

    // Its Category is the Trip's own, so the same outing cannot be typed in again as an expense.
    const categories = await manager.client.money.categories();
    const trips = categories.find((one) => one.key === "buying_trip");
    expect(trips?.enterable).toBe(false);
  });

  it("is the Owner's and the Manager's, and nobody else's", async () => {
    const others = await Promise.all(
      (["staff", "vet"] as const).map((role) =>
        createTestClient(appRouter, { as: role })
      )
    );
    await Promise.all(
      others.map((other) =>
        expect(
          other.client.buyingTrips.record({
            wentTo: `না ${suffix}`,
            transportMoney: 100,
            paymentMethod: "cash",
          })
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
      )
    );
  });
});
