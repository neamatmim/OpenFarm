import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const NOW = "2068-02-02T04:00:00.000Z";
const suffix = `monthly-feed-${Date.now()}`;
const asManager = () =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(NOW) });

const setup = async () => {
  const { client } = await asManager();
  const bran = await client.feed.items.create({
    name: { bn: `ভুসি ${suffix}`, en: "Bran" },
  });
  const grass = await client.feed.items.create({
    name: { bn: `ঘাস ${suffix}` },
  });
  const molasses = await client.feed.items.create({
    name: { bn: `গুড় ${suffix}` },
    unit: "liter",
  });
  const bundles = await client.feed.items.create({
    name: { bn: `আঁটি ${suffix}` },
    unit: "bundle",
  });
  const unused = await client.feed.items.create({
    name: { bn: `অব্যবহৃত ${suffix}` },
  });
  const retired = await client.feed.items.create({
    name: { bn: `পুরোনো ${suffix}` },
  });
  await client.feed.items.retire({ id: retired.id });
  const shed = await client.sheds.create({ name: suffix });
  const pens: string[] = [];
  for (const name of ["weighed", "unweighed", "unassigned", "empty"]) {
    // oxlint-disable-next-line no-await-in-loop -- create each named pen in order
    const pen = await client.sheds.pens.create({
      shedId: shed.id,
      name,
      quarantine: true,
    });
    pens.push(pen.id);
  }
  const [
    weighedPen = "",
    unweighedPen = "",
    unassignedPen = "",
    emptyPen = "",
  ] = pens;
  for (const weightKg of [200, 300]) {
    // oxlint-disable-next-line no-await-in-loop -- two intake records in sequence
    await client.intakes.record({
      penId: weighedPen,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2068-02-01T04:00:00.000Z"),
      targetWindowStart: "2068-05-01",
      targetWindowEnd: "2068-05-05",
    });
  }
  for (const penId of [weighedPen, unweighedPen, unassignedPen]) {
    // oxlint-disable-next-line no-await-in-loop -- record the unweighed animals in their pens
    await client.animals.register({
      penId,
      sex: "female",
      side: "dairy",
      state: "heifer",
      source: "born",
      aliases: [],
    });
  }
  const ration = await client.feed.rations.save({
    name: { bn: `রেশন ${suffix}` },
    items: [
      { feedItemId: bran.id, kgPerAnimalPerDay: 2 },
      { feedItemId: grass.id, kgPer100KgPerDay: 3 },
      { feedItemId: molasses.id, kgPerAnimalPerDay: 0.5 },
      { feedItemId: bundles.id, kgPerAnimalPerDay: 1 },
    ],
  });
  for (const penId of [weighedPen, unweighedPen, emptyPen]) {
    // oxlint-disable-next-line no-await-in-loop -- assign one pen at a time
    await client.feed.rations.assign({ penId, rationId: ration.rationId });
  }
  await client.stock.receive({
    feedItemId: bran.id,
    kind: "purchase",
    quantity: 200,
    priceMoney: 6000,
    seller: { name: `ফিডস ${suffix}` },
    receivedOn: "2068-01-01",
  });
  await client.stock.receive({
    feedItemId: bran.id,
    kind: "purchase",
    quantity: 50,
    priceMoney: 1500,
    seller: { name: `ফিডস ${suffix}` },
    receivedOn: "2068-01-01",
    expiresOn: "2068-01-31",
  });
  return {
    bran,
    grass,
    molasses,
    bundles,
    unused,
    retired,
    unweighedPen,
    weighedPen,
    ration,
  };
};

let world: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  world = await setup();
});

const estimate = async (month = "2068-02") => {
  const { client } = await asManager();
  return client.stock.monthlyEstimate({ month });
};

describe("monthly feed estimate", () => {
  it("plans from today's herd without requiring a feeding SOP, using the full calendar month", async () => {
    const result = await estimate();
    expect(result).toMatchObject({
      month: "2068-02",
      days: 29,
      basis: "rations",
      asOf: new Date(NOW),
    });
    expect(
      result.lines.find((line) => line.feedItemId === world.bran.id)
    ).toMatchObject({
      nameEn: "Bran",
      unit: "kg",
      perDay: 8,
      required: 232,
      expiredLeft: 50,
      available: 200,
      toBuy: 32,
      priceMoney: 30,
      requiredMoney: 6960,
      toBuyMoney: 960,
    });
    const march = await estimate("2068-03");
    expect(
      march.lines.find((line) => line.feedItemId === world.bran.id)
    ).toMatchObject({ required: 248, toBuy: 48 });
  });
  it("reports missing weights and unassigned animals while keeping other units usable", async () => {
    const result = await estimate();
    expect(result).toMatchObject({
      animalsWithoutRation: 1,
      estimatedWeights: 1,
    });
    expect(
      result.lines.find((line) => line.feedItemId === world.grass.id)
    ).toMatchObject({
      missingWeight: true,
      perDay: null,
      required: null,
      toBuy: null,
    });
    expect(
      result.lines.find((line) => line.feedItemId === world.molasses.id)
    ).toMatchObject({
      unit: "liter",
      perDay: 2,
      required: 58,
      toBuy: 58,
      toBuyMoney: null,
    });
    expect(
      result.lines.find((line) => line.feedItemId === world.bundles.id)
    ).toMatchObject({ unit: "bundle", required: 116 });
    expect(result.totals).toMatchObject({
      unknownDemand: 1,
      unpriced: 2,
      itemsToBuy: 3,
      requiredMoney: 6960,
      toBuyMoney: 960,
    });
  });
  it("shows unused items as zero demand and leaves retired feed out of planning", async () => {
    const result = await estimate();
    expect(
      result.lines.find((line) => line.feedItemId === world.unused.id)
    ).toMatchObject({ required: 0, toBuy: 0, requiredMoney: 0, toBuyMoney: 0 });
    expect(
      result.lines.some((line) => line.feedItemId === world.retired.id)
    ).toBe(false);
  });
  it("has no recent estimate for feed never recorded as given, rather than claiming it needs none", async () => {
    const { client } = await asManager();
    const result = await client.stock.monthlyEstimate({
      month: "2068-02",
      basis: "recent",
    });
    expect(result).toMatchObject({
      animalsWithoutRation: 0,
      estimatedWeights: 0,
    });
    expect(
      result.lines.find((line) => line.feedItemId === world.bran.id)
    ).toMatchObject({
      perDay: null,
      required: null,
      toBuyMoney: null,
      missingWeight: false,
    });
    expect(result.totals.unknownDemand).toBe(result.lines.length);
  });
  it("is readable by the owner and manager and refuses other roles", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(NOW),
    });
    const ownersEstimate = await owner.client.stock.monthlyEstimate({
      month: "2068-02",
    });
    expect(ownersEstimate.days).toBe(29);
    for (const as of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- check each role's refusal
      const caller = await createTestClient(appRouter, {
        as,
        clock: new FakeClock(NOW),
      });
      // oxlint-disable-next-line no-await-in-loop -- check each role's refusal
      await expect(
        caller.client.stock.monthlyEstimate({ month: "2068-02" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("rejects invalid calendar months", async () => {
    const { client } = await asManager();
    await expect(
      client.stock.monthlyEstimate({ month: "2068-13" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("recomputes when a pen changes ration rather than storing an old estimate", async () => {
    const { client } = await asManager();
    const headOnly = await client.feed.rations.save({
      name: { bn: `নতুন রেশন ${suffix}` },
      items: [{ feedItemId: world.bran.id, kgPerAnimalPerDay: 4 }],
    });
    await client.feed.rations.assign({
      penId: world.unweighedPen,
      rationId: headOnly.rationId,
    });
    try {
      const result = await estimate();
      expect(
        result.lines.find((line) => line.feedItemId === world.bran.id)
      ).toMatchObject({ perDay: 10, required: 290, toBuy: 90 });
      expect(
        result.lines.find((line) => line.feedItemId === world.grass.id)
      ).toMatchObject({ perDay: 22.5, required: 652.5, missingWeight: false });
    } finally {
      await client.feed.rations.assign({
        penId: world.unweighedPen,
        rationId: world.ration.rationId,
      });
    }
  });
});
