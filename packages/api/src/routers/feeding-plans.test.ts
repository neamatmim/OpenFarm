import { eq } from "@OpenFarm/db/operators";
import { animalFeedPlan } from "@OpenFarm/db/schema/feeding-plan";
import { animal } from "@OpenFarm/db/schema/herd";
import { FakeClock, asTheFarmHeldItBefore } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { animalPlanView, planningAnimal } from "../feeding-plan-store";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `feeding-plan-${Date.now()}`;
const NOW = "2068-02-02T04:00:00.000Z";
const manager = (now = NOW) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(now) });
const setup = async () => {
  const { client } = await manager();
  const bran = await client.feed.items.create({
    name: { bn: `ভুসি ${suffix}`, en: "Bran" },
  });
  const grass = await client.feed.items.create({
    name: { bn: `ঘাস ${suffix}`, en: "Grass" },
  });
  const shed = await client.sheds.create({ name: suffix });
  const pen = await client.sheds.pens.create({
    shedId: shed.id,
    name: suffix,
    quarantine: true,
  });
  const rationInput = {
    name: { bn: `বর্ধন ${suffix}` },
    band: { fromKg: 100, toKg: 250 },
    expectedGain: { lowKg: 0.5, highKg: 1 },
    items: [
      { feedItemId: bran.id, kgPerAnimalPerDay: 2 },
      { feedItemId: grass.id, kgPer100KgPerDay: 2 },
    ],
  };
  const grower = await client.feed.rations.save(rationInput);
  const finisher = await client.feed.rations.save({
    name: { bn: `শেষ ${suffix}` },
    band: { fromKg: 250, toKg: null },
    expectedGain: { lowKg: 0.5, highKg: 1 },
    items: [
      { feedItemId: bran.id, kgPerAnimalPerDay: 3 },
      { feedItemId: grass.id, kgPer100KgPerDay: 3 },
    ],
  });
  const intakeInput = {
    penId: pen.id,
    sex: "male" as const,
    seller: { name: suffix },
    purchasePriceMoney: 50_000,
    weightKg: 150,
    estimatedAgeMonths: 18,
    arrivedAt: new Date("2068-02-01T04:00:00.000Z"),
    targetWindowStart: "2068-11-01",
    targetWindowEnd: "2068-11-05",
  };
  const bull = await client.intakes.record(intakeInput);
  const unplanned = await client.intakes.record(intakeInput);
  await client.feed.rations.assign({
    penId: pen.id,
    rationId: grower.rationId,
  });
  await client.stock.receive({
    feedItemId: bran.id,
    quantity: 80,
    priceMoney: 2400,
    kind: "purchase",
    seller: { name: suffix },
    receivedOn: "2068-01-01",
  });
  await client.stock.receive({
    feedItemId: bran.id,
    quantity: 20,
    priceMoney: 600,
    kind: "purchase",
    seller: { name: suffix },
    receivedOn: "2068-01-01",
    expiresOn: "2068-01-31",
  });
  const input = {
    tagNumber: bull.tagNumber,
    previousPlanId: null,
    startDay: "2068-02-01",
    startWeightKg: 150,
    saleDay: "2068-11-01",
    targetWeightKg: 350,
    adaptationDays: 0,
    transitionDays: 7,
    reviewDays: 28,
    reservePercent: 10,
    arrivalRationId: null,
    stageRationIds: [grower.rationId, finisher.rationId],
  };
  return {
    bran,
    grass,
    pen,
    bull,
    unplanned,
    grower,
    finisher,
    rationInput,
    input,
  };
};
let world: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  world = await setup();
});

describe("animal feeding plans", () => {
  it("starts with intake facts, saves a snapshot and never changes the pen's ration", async () => {
    const { client, context } = await manager();
    const before = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    expect(before.plan).toBeNull();
    expect(before.defaults).toMatchObject({
      startWeightKg: 150,
      startDay: "2068-02-01",
      saleDay: "2068-11-01",
    });
    const saved = await client.feedingPlans.save(world.input);
    const detail = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber.toLowerCase(),
    });
    expect(detail.planId).toBe(saved.id);
    expect(detail.baseline).toEqual(detail.plan);
    expect(detail.view?.forecasts).toHaveLength(3);
    expect(detail.view?.forecasts[1]?.months[0]?.days).toBe(28);
    expect(detail.view?.forecasts[1]?.unpriced).toBe(1);
    expect(
      detail.view?.forecasts[1]?.lines.find(
        (line) => line.feedItemId === world.bran.id
      )?.priceMoney
    ).toBe(30);
    expect(
      await context.db.query.penRation.findFirst({
        where: { penId: world.pen.id },
      })
    ).toMatchObject({ rationId: world.grower.rationId });
    expect(
      await context.db.query.auditEvent.findFirst({
        where: { entity: "animal_feed_plan", entityId: saved.id },
      })
    ).toMatchObject({ action: "create", roleUsed: "manager" });
  });
  it("ends arrival adaptation by today's date even before the next weigh-in", async () => {
    const { client, context } = await manager("2068-03-01T04:00:00.000Z");
    const { farm } = context;
    if (!farm) {
      throw new Error("Expected test farm");
    }
    const detail = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    if (!detail.plan) {
      throw new Error("Expected saved plan");
    }
    const plan = {
      ...detail.plan,
      adaptationDays: 21,
      arrival: detail.plan.stages[1] ?? null,
    };
    const bull = await planningAnimal(
      context.db,
      farm.id,
      world.bull.tagNumber,
      context.clock.now()
    );
    const view = animalPlanView(
      bull,
      plan,
      plan,
      farm,
      context.clock.now(),
      [],
      null
    );
    expect(view.measured.day).toBe("2068-02-01");
    expect(view.reviewRation?.rationId).toBe(world.grower.rationId);
  });
  it("updates only the remaining forecast from a reliable weigh-in and reminds when it is stale", async () => {
    const { client } = await manager("2068-03-20T04:00:00.000Z");
    await client.animals.weighIn({
      tagNumber: world.bull.tagNumber,
      weightKg: 180,
      weighedAt: new Date("2068-03-01T04:00:00.000Z"),
    });
    const detail = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    expect(detail.view).toMatchObject({
      measured: { day: "2068-03-01", weightKg: 180 },
      dueDay: "2068-03-29",
      weightOverdue: false,
    });
    expect(detail.view?.forecasts[1]?.months[0]).toMatchObject({
      month: "2068-03",
      days: 12,
    });
    expect(detail.view?.weightDifferenceKg).not.toBe(0);
    expect(detail.view?.originals[1]?.months[0]?.days).toBe(29);
    const overdue = await manager("2068-04-01T04:00:00.000Z");
    const overdueDetail = await overdue.client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    expect(overdueDetail.view?.weightOverdue).toBe(true);
  });
  it("keeps the first plan when rations are edited or a revision is approved", async () => {
    const { client } = await manager();
    const before = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    await client.feed.rations.save({
      ...world.rationInput,
      rationId: world.grower.rationId,
      items: [
        { feedItemId: world.bran.id, kgPerAnimalPerDay: 4 },
        { feedItemId: world.grass.id, kgPer100KgPerDay: 2 },
      ],
    });
    const edited = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    expect(edited.plan).toEqual(before.plan);
    expect(edited.rationsChanged).toBe(true);
    const saved = await client.feedingPlans.save({
      ...world.input,
      previousPlanId: before.planId,
      reservePercent: 15,
    });
    const revised = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    expect(revised.planId).toBe(saved.id);
    expect(revised.revisions).toHaveLength(2);
    expect(revised.rationsChanged).toBe(false);
    expect(revised.baseline).toEqual(before.baseline);
    expect(revised.plan?.stages[0]?.items[0]).toMatchObject({
      kgPerAnimalPerDay: 4,
    });
  });
  it("rejects a stale editor, missing stage coverage, overlapping stages and invalid dates", async () => {
    const { client } = await manager();
    await expect(client.feedingPlans.save(world.input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const detail = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    const input = { ...world.input, previousPlanId: detail.planId };
    await expect(
      client.feedingPlans.save({ ...input, adaptationDays: 21 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.feedingPlans.save({
        ...input,
        stageRationIds: [world.grower.rationId],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.feedingPlans.save({
        ...input,
        stageRationIds: [world.grower.rationId, world.grower.rationId],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.feedingPlans.save({ ...input, saleDay: "2068-02-30" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.feedingPlans.summary({ month: "wrong" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("shares stock once and deducts earlier demand before estimating future purchases", async () => {
    const { client } = await manager();
    await client.feedingPlans.save({
      ...world.input,
      tagNumber: world.unplanned.tagNumber,
    });
    const feb = await client.feedingPlans.summary({
      month: "2068-02",
      scenario: "expected",
    });
    const bran = feb.lines.find((one) => one.feedItemId === world.bran.id);
    // 28 remaining days: one animal gets 4/day with a 15% reserve; the second 4/day with 10%.
    expect(bran).toMatchObject({
      required: 224,
      withReserve: 252,
      carried: 80,
      toBuy: 172,
      money: 5160,
    });
    const march = await client.feedingPlans.summary({
      month: "2068-03",
      scenario: "expected",
    });
    expect(
      march.lines.find((one) => one.feedItemId === world.bran.id)?.carried
    ).toBe(0);
    expect(march.withoutPlan).toBe(0);
  });
  it("excludes animals that left and rejects plans for other farms' rations or animals", async () => {
    const { client, context } = await manager();
    const detail = await client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    await expect(
      client.feedingPlans.save({
        ...world.input,
        previousPlanId: detail.planId,
        stageRationIds: ["foreign-ration"],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.feedingPlans.get({ tagNumber: "NOT-HERE" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await asTheFarmHeldItBefore(async (tx) => {
      await tx
        .update(animal)
        .set({ state: "sold" })
        .where(eq(animal.id, detail.animalId));
    });
    const summary = await client.feedingPlans.summary({ month: "2068-02" });
    expect(
      summary.rows.some((row) => row.tagNumber === world.bull.tagNumber)
    ).toBe(false);
    await expect(
      client.feedingPlans.save({
        ...world.input,
        previousPlanId: detail.planId,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      context.db
        .update(animalFeedPlan)
        .set({ snapshot: {} })
        .where(eq(animalFeedPlan.id, detail.planId ?? ""))
    ).rejects.toThrow();
  });
  it("allows owners and managers, refusing staff, vets and unauthenticated callers", async () => {
    for (const as of ["staff", "vet", null] as const) {
      // oxlint-disable-next-line no-await-in-loop -- verify each role against the real authorization middleware
      const { client } = await createTestClient(appRouter, {
        as,
        clock: new FakeClock(NOW),
      });
      // oxlint-disable-next-line no-await-in-loop -- verify each role independently
      await expect(
        client.feedingPlans.get({ tagNumber: world.bull.tagNumber })
      ).rejects.toBeDefined();
      // oxlint-disable-next-line no-await-in-loop -- verify each role independently
      await expect(client.feedingPlans.save(world.input)).rejects.toBeDefined();
    }
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(NOW),
    });
    const ownerDetail = await owner.client.feedingPlans.get({
      tagNumber: world.bull.tagNumber,
    });
    expect(ownerDetail.plan).not.toBeNull();
  });
});
