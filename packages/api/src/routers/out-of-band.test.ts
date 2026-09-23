import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Ration's weight band — a grower's 150 to 250 kg, a finisher's from 250 — and the bulls the scale says are in the
// wrong Pen for it: grown past their Pen's band, or not yet up to it, each with the Pens whose Ration fits him.

const suffix = `band-${Date.now()}`;
const ARRIVED = "2037-06-01T04:00:00.000Z";
const LATER = "2037-06-02T04:00:00.000Z";

const as = (role: "owner" | "manager" | "staff", instant = LATER) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const setup = async () => {
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = async (name: string) =>
    await manager.client.herd.createPen({ shedId: shed.id, name });
  const growers = await pen("গ্রোয়ার পেন");
  const finishers = await pen("ফিনিশার পেন");
  const unbanded = await pen("সাধারণ পেন");
  const straw = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  const ration = async (
    name: string,
    penId: string,
    band?: { fromKg: number | null; toKg: number | null }
  ) => {
    const saved = await manager.client.feed.saveRation({
      name: { bn: `${name} ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
      ...(band ? { band } : {}),
    });
    await manager.client.feed.assignRation({
      penId,
      rationId: saved.rationId,
    });
    return saved.rationId;
  };
  const grower = await ration("গ্রোয়ার", growers.id, {
    fromKg: 150,
    toKg: 250,
  });
  await ration("ফিনিশার", finishers.id, { fromKg: 250, toKg: null });
  await ration("সাধারণ", unbanded.id);
  const bull = async (penId: string, weightKg: number) => {
    const arrived = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2037-10-01",
      targetWindowEnd: "2037-10-05",
    });
    return arrived.tagNumber;
  };
  return {
    pens: { growers, finishers, unbanded },
    rations: { grower },
    straw,
    tags: {
      fits: await bull(growers.id, 200),
      outgrown: await bull(growers.id, 260),
      // Too light for the finishers, and heavy enough for the growers.
      tooLight: await bull(finishers.id, 180),
      noBand: await bull(unbanded.id, 400),
      sold: await bull(growers.id, 300),
    },
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
  // Gone from the farm: however heavy, nobody need move him.
  const manager = await as("manager");
  await manager.client.sale.record({
    tagNumber: world.tags.sold,
    buyer: { name: `কসাই ${suffix}` },
    priceBdt: 90_000,
    weightKg: 300,
    destination: "গাবতলী",
    vehicle: "ঢাকা মেট্রো ট ১১-২২৩৩",
    driver: "করিম",
  });
});

describe("the bulls in the wrong Pen for their size", () => {
  it("names the one grown out of his Pen's Ration, and the Pen whose Ration fits him", async () => {
    const owner = await as("owner");
    const rows = await owner.client.fattening.outOfBand();
    expect(rows.find((one) => one.tagNumber === world.tags.outgrown)).toEqual({
      tagNumber: world.tags.outgrown,
      weightKg: 260,
      weighedAt: new Date(ARRIVED),
      standing: "outgrown",
      pen: {
        penId: world.pens.growers.id,
        penName: `${suffix} / গ্রোয়ার পেন`,
        rationName: `গ্রোয়ার ${suffix}`,
        band: { fromKg: 150, toKg: 250 },
      },
      fitsIn: [
        {
          penId: world.pens.finishers.id,
          penName: `${suffix} / ফিনিশার পেন`,
          rationName: `ফিনিশার ${suffix}`,
        },
      ],
    });
    // Grown out of it comes first: he is eating a small bull's share.
    expect(rows[0]?.standing).toBe("outgrown");
  });

  it("names the one too light for the bulls he is penned with", async () => {
    const owner = await as("owner");
    const rows = await owner.client.fattening.outOfBand();
    expect(
      rows.find((one) => one.tagNumber === world.tags.tooLight)
    ).toMatchObject({
      standing: "too_light",
      fitsIn: [{ penId: world.pens.growers.id }],
    });
  });

  it("leaves out a bull that fits, one in a Pen with no band, and one already gone", async () => {
    const owner = await as("owner");
    const rows = await owner.client.fattening.outOfBand();
    const tags = rows.map((one) => one.tagNumber);
    expect(tags).toEqual([world.tags.outgrown, world.tags.tooLight]);
  });

  it("keeps a Ration's band when it is written again without one, and says what it is", async () => {
    const manager = await as("manager");
    await manager.client.feed.saveRation({
      rationId: world.rations.grower,
      name: { bn: `গ্রোয়ার ${suffix}` },
      items: [{ feedItemId: world.straw.id, kgPer100KgPerDay: 1.2 }],
    });
    const rations = await manager.client.feed.rations();
    expect(
      rations.find((one) => one.id === world.rations.grower)?.band
    ).toEqual({ fromKg: 150, toKg: 250 });
  });

  it("refuses a band nobody fits", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.feed.saveRation({
        rationId: world.rations.grower,
        name: { bn: `গ্রোয়ার ${suffix}` },
        items: [{ feedItemId: world.straw.id, kgPer100KgPerDay: 1 }],
        band: { fromKg: 250, toKg: 150 },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { problems: ["band: From must be below To"] },
    });
  });

  it("is the Owner's and the Manager's, who move them", async () => {
    const manager = await as("manager");
    expect(await manager.client.fattening.outOfBand()).toHaveLength(2);
    const staff = await as("staff");
    await expect(staff.client.fattening.outOfBand()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
