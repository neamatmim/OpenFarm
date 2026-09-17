import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Selling Trip: one outing to sell cattle, with what the day cost. Split evenly across every Animal
 * taken — sold or brought home again, because a bull that came back still stood on the lorry.
 */
const suffix = `selling-${Date.now()}`;
const PERIOD = { from: "2041-03-01", to: "2041-03-31" };
const WINDOW = {
  targetWindowStart: "2041-06-01",
  targetWindowEnd: "2041-06-05",
};

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let penId = "";

const buy = async (manager: Awaited<ReturnType<typeof as>>, price = 50_000) => {
  const taken = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: price,
    weightKg: 200,
    estimatedAgeMonths: 20,
    ...WINDOW,
  });
  return taken.tagNumber;
};

const costOf = async (tagNumber: string) => {
  const owner = await as("owner", "2041-04-01T04:00:00.000Z");
  return await owner.client.costs.ofAnimal({ tagNumber });
};

beforeAll(async () => {
  const owner = await as("owner", "2041-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "ফ্যাটেনিং",
  });
  penId = pen.id;
});

describe("a Selling Trip", () => {
  it("charges every animal taken, whether she sold or came home again", async () => {
    const manager = await as("manager", "2041-03-05T04:00:00.000Z");
    // Four bulls on the lorry: the day cost 8,000 in all.
    const herd = [
      await buy(manager),
      await buy(manager),
      await buy(manager),
      await buy(manager),
    ];
    await manager.client.sellingTrips.record({
      wentTo: `ঈদের হাট ${suffix}`,
      transportBdt: 6000,
      keepBdt: 2000,
      animals: herd,
      paymentMethod: "cash",
    });

    // Two of them sold; two came home. All four paid for their place on the lorry.
    const selling = await as("manager", "2041-03-06T04:00:00.000Z");
    // Two of them sold at the haat; two came home again.
    await Promise.all(
      herd.slice(0, 2).map((tagNumber, which) =>
        selling.client.sale.record({
          tagNumber,
          // A buyer each: two buyers of one name would be one trader, and the two sales race to make him.
          buyer: { name: `ক্রেতা ${which} ${suffix}` },
          priceBdt: 90_000,
          weightKg: 300,
          destination: "ঢাকা",
          vehicle: "ঢাকা মেট্রো ট-১১-২২৩৩",
          driver: "সোবহান",
          paymentMethod: "cash",
        })
      )
    );

    const each = await Promise.all(herd.map((tagNumber) => costOf(tagNumber)));
    for (const one of each) {
      expect(one).toMatchObject({ tripBdt: 2000 });
    }
  });

  it("charges an animal taken twice a share of both outings", async () => {
    const manager = await as("manager", "2041-03-08T04:00:00.000Z");
    const twice = await buy(manager);
    const other = await buy(manager);
    await manager.client.sellingTrips.record({
      wentTo: `প্রথম হাট ${suffix}`,
      transportBdt: 4000,
      animals: [twice, other],
      paymentMethod: "cash",
    });
    const again = await as("manager", "2041-03-15T04:00:00.000Z");
    await again.client.sellingTrips.record({
      wentTo: `দ্বিতীয় হাট ${suffix}`,
      transportBdt: 3000,
      animals: [twice],
      paymentMethod: "cash",
    });
    // Half of the first outing, the whole of the second.
    expect(await costOf(twice)).toMatchObject({ tripBdt: 5000 });
    expect(await costOf(other)).toMatchObject({ tripBdt: 2000 });
  });

  it("charges the animals taken even when the day sold nothing", async () => {
    const manager = await as("manager", "2041-03-20T04:00:00.000Z");
    const one = await buy(manager);
    const two = await buy(manager);
    await manager.client.sellingTrips.record({
      wentTo: `খালি ফেরা ${suffix}`,
      transportBdt: 5000,
      animals: [one, two],
      paymentMethod: "cash",
    });
    expect(await costOf(one)).toMatchObject({ tripBdt: 2500 });
    expect(await costOf(two)).toMatchObject({ tripBdt: 2500 });

    const owner = await as("owner", "2041-04-01T04:00:00.000Z");
    const report = await owner.client.costs.bySide(PERIOD);
    // Nothing of it is unallocated: the animals were taken, whether or not anybody bought them.
    expect(report.unallocated.tripBdt).toBe(0);
  });

  it("reaches the farm's money once, under its own Category", async () => {
    const manager = await as("manager", "2041-03-25T04:00:00.000Z");
    const one = await buy(manager);
    const trip = await manager.client.sellingTrips.record({
      wentTo: `হিসাবের হাট ${suffix}`,
      transportBdt: 2200,
      keepBdt: 800,
      animals: [one],
      paymentMethod: "bank",
    });
    const money = await manager.client.money.list({
      from: "2041-03-01",
      to: "2041-03-31",
    });
    expect(money.events.filter((each) => each.sourceId === trip.id)).toEqual([
      expect.objectContaining({ amountBdt: 3000, direction: "out" }),
    ]);
    const categories = await manager.client.money.categories();
    expect(
      categories.find((each) => each.key === "selling_trip")?.enterable
    ).toBe(false);
  });

  it("charges a beast who sold before the day was written up", async () => {
    const manager = await as("manager", "2041-03-21T04:00:00.000Z");
    const one = await buy(manager);
    const two = await buy(manager);
    // The Eid order: the bulls sell at the haat, and the day's costs are written up that evening.
    await manager.client.sale.record({
      tagNumber: one,
      buyer: { name: `ঈদের ক্রেতা ${suffix}` },
      priceBdt: 95_000,
      weightKg: 310,
      destination: "চট্টগ্রাম",
      vehicle: "চট্ট মেট্রো ট-৯-১১১১",
      driver: "কামাল",
      paymentMethod: "cash",
    });
    await manager.client.sellingTrips.record({
      wentTo: `সন্ধ্যায় লেখা ${suffix}`,
      transportBdt: 3000,
      animals: [one, two],
      paymentMethod: "cash",
    });
    expect(await costOf(one)).toMatchObject({ tripBdt: 1500 });
    expect(await costOf(two)).toMatchObject({ tripBdt: 1500 });
  });

  it("puts right what the day cost, and re-charges the animals taken", async () => {
    const manager = await as("manager", "2041-03-22T04:00:00.000Z");
    const one = await buy(manager);
    const two = await buy(manager);
    const trip = await manager.client.sellingTrips.record({
      wentTo: `ভুল ভাড়া ${suffix}`,
      transportBdt: 4000,
      animals: [one, two],
      paymentMethod: "cash",
    });
    await manager.client.sellingTrips.correct({
      id: trip.id,
      reason: "গাড়ি ভাড়া ৫,০০০ ছিল",
      changes: { transportBdt: { from: 4000, to: 5000 } },
    });
    expect(await costOf(one)).toMatchObject({ tripBdt: 2500 });
    const money = await manager.client.money.list({
      from: "2041-03-01",
      to: "2041-03-31",
    });
    expect(money.events.filter((each) => each.sourceId === trip.id)).toEqual([
      expect.objectContaining({ amountBdt: 5000 }),
    ]);
  });

  it("takes one beast once, however many times her tag is ticked", async () => {
    const manager = await as("manager", "2041-03-23T04:00:00.000Z");
    const one = await buy(manager);
    await manager.client.sellingTrips.record({
      wentTo: `দুইবার টিক ${suffix}`,
      transportBdt: 2000,
      animals: [one, one],
      paymentMethod: "cash",
    });
    expect(await costOf(one)).toMatchObject({ tripBdt: 2000 });
  });

  it("refuses an animal that is not this farm's, and nobody but the Owner and the Manager", async () => {
    const manager = await as("manager", "2041-03-26T04:00:00.000Z");
    await expect(
      manager.client.sellingTrips.record({
        wentTo: `ভুল গরু ${suffix}`,
        transportBdt: 100,
        animals: ["F-9999999"],
        paymentMethod: "cash",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const others = await Promise.all(
      (["staff", "vet"] as const).map((role) =>
        createTestClient(appRouter, { as: role })
      )
    );
    await Promise.all(
      others.map((other) =>
        expect(
          other.client.sellingTrips.record({
            wentTo: `না ${suffix}`,
            transportBdt: 100,
            animals: ["F-0001"],
            paymentMethod: "cash",
          })
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
      )
    );
  });
});
