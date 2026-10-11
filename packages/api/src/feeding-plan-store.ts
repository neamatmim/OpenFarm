import type { Database } from "@OpenFarm/db";
import {
  addDays,
  bandStanding,
  expectedGainFor,
  farmDayOf,
  gainOnRationOf,
  gainStandingOf,
  roundMoney,
  startOfFarmDay,
} from "@OpenFarm/domain";
import type {
  FeedingPlan,
  FeedPlanScenario,
  PlanForecast,
  PlannedRation,
} from "@OpenFarm/domain/feeding-plan";
import {
  FEED_PLAN_SCENARIOS,
  forecastFeedingPlan,
  plannedQuantity,
} from "@OpenFarm/domain/feeding-plan";
import { expiryWindow } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { bandOf, expectedGainOf, linesOf } from "./feed-store";
import { isOnTheFarm } from "./instances-store";
import { stockOnHand } from "./stock-store";

export const planDayInput = z.iso.date();
const plannedRationSchema = z.object({
  rationId: z.string(),
  versionId: z.string(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  band: z.object({
    fromKg: z.number().nullable(),
    toKg: z.number().nullable(),
  }),
  gain: z.object({ lowKg: z.number(), highKg: z.number() }).nullable(),
  items: z.array(
    z.union([
      z.object({ feedItemId: z.string(), kgPerAnimalPerDay: z.number() }),
      z.object({ feedItemId: z.string(), kgPer100KgPerDay: z.number() }),
    ])
  ),
});
export const feedingPlanSchema = z.object({
  startDay: planDayInput,
  startWeightKg: z.number().positive(),
  saleDay: planDayInput,
  targetWeightKg: z.number().positive(),
  adaptationDays: z.number().int().min(0).max(60),
  transitionDays: z.number().int().min(0).max(30),
  reviewDays: z.number().int().min(7).max(90),
  reservePercent: z.number().min(0).max(50),
  arrival: plannedRationSchema.nullable(),
  stages: z.array(plannedRationSchema),
});

export const planFromSnapshot = (snapshot: unknown): FeedingPlan => {
  const parsed = feedingPlanSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "The saved feeding plan could not be read",
    });
  }
  return parsed.data;
};

export interface PlanningFarm {
  id: string;
  expiryWarnDays: number;
  feedDaysLow: number;
  gainReadDays: number;
  deshiGainPercent: number;
  femaleGainPercent: number;
}

export const planningAnimal = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  tagNumber: string,
  now: Date
) => {
  const animal = await db.query.animal.findFirst({
    where: { farmId, tagNumber: tagNumber.toUpperCase() },
    with: {
      moves: {
        columns: { movedAt: true },
        orderBy: { movedAt: "desc", id: "desc" },
        limit: 1,
      },
      breed: { columns: { deshi: true, gainPercent: true } },
      intake: true,
      joinings: { orderBy: { joinedAt: "desc", id: "desc" }, limit: 1 },
      weighIns: {
        where: { flaggedNote: { isNull: true }, weighedAt: { lte: now } },
        columns: { weightKg: true, weighedAt: true },
        orderBy: { weighedAt: "desc", id: "desc" },
      },
    },
  });
  if (!animal || animal.side !== "fattening") {
    throw new ORPCError("NOT_FOUND", {
      message: "No fattening animal with this tag",
    });
  }
  return animal;
};
type PlanningAnimal = Awaited<ReturnType<typeof planningAnimal>>;

export const planningRations = async (
  db: Pick<Database, "query"> | Tx,
  farm: PlanningFarm,
  animal: PlanningAnimal
): Promise<PlannedRation[]> => {
  const rows = await db.query.ration.findMany({
    where: { farmId: farm.id, retiredAt: { isNull: true } },
    with: { currentVersion: true },
  });
  return rows.flatMap((row) => {
    if (!row.currentVersion) {
      return [];
    }
    const gain = expectedGainOf(row);
    return [
      {
        rationId: row.id,
        versionId: row.currentVersion.id,
        nameBn: row.nameBn,
        nameEn: row.nameEn,
        band: bandOf(row),
        items: linesOf(row.currentVersion.items),
        gain: gain
          ? expectedGainFor(
              gain,
              {
                sex: animal.sex,
                deshi: animal.breed?.deshi ?? null,
                breedPercent: animal.breed?.gainPercent ?? null,
              },
              {
                deshiPercent: farm.deshiGainPercent,
                femalePercent: farm.femaleGainPercent,
              }
            ).expectedGain
          : null,
      },
    ];
  });
};

export const planStock = async (
  db: Pick<Database, "query" | "execute">,
  farm: PlanningFarm,
  now: Date
) =>
  await stockOnHand(db, farm.id, expiryWindow(now, farm.expiryWarnDays), {
    now,
    feedDaysLow: farm.feedDaysLow,
  });
type PlanStock = Awaited<ReturnType<typeof planStock>>;

/** Prices are today's replacement estimate; no missing price is silently treated as free feed. */
export const pricedForecast = (
  forecast: PlanForecast,
  stock: PlanStock,
  reservePercent: number
) => {
  const itemOf = new Map(stock.map((item) => [item.feedItemId, item]));
  const price = (feeds: PlanForecast["feeds"]) => {
    let knownMoney = 0;
    let unpriced = 0;
    const lines = feeds.map((feed) => {
      const item = itemOf.get(feed.feedItemId);
      const quantity = plannedQuantity(feed.quantity, item?.unit ?? "kg");
      const withReserve = plannedQuantity(
        feed.quantity * (1 + reservePercent / 100),
        item?.unit ?? "kg"
      );
      const priceMoney =
        item?.averagePriceMoney ?? item?.fodderPriceMoney ?? null;
      const money =
        priceMoney === null ? null : roundMoney(quantity * priceMoney);
      if (money === null) {
        unpriced += 1;
      } else {
        knownMoney += money;
      }
      return {
        ...feed,
        quantity,
        withReserve,
        nameBn: item?.nameBn ?? feed.feedItemId,
        nameEn: item?.nameEn ?? null,
        unit: item?.unit ?? "kg",
        priceMoney,
        money,
        retired: item?.retiredAt !== null && item?.retiredAt !== undefined,
      };
    });
    return { lines, knownMoney: roundMoney(knownMoney), unpriced };
  };
  return {
    ...forecast,
    ...price(forecast.feeds),
    months: forecast.months.map((month) => ({
      ...month,
      ...price(month.feeds),
    })),
  };
};

const measuredPlanGain = (
  animal: PlanningAnimal,
  plan: FeedingPlan,
  farm: PlanningFarm,
  activeRation: { rationId: string; assignedAt: Date } | null
) => {
  const adaptationUntil = addDays(plan.startDay, plan.adaptationDays);
  const readings = animal.weighIns.map((reading) => ({
    weightKg: Number(reading.weightKg),
    weighedAt: reading.weighedAt,
  }));
  const gain = gainOnRationOf(readings, {
    countsFrom: startOfFarmDay(
      [
        adaptationUntil,
        activeRation ? farmDayOf(activeRation.assignedAt) : plan.startDay,
        animal.moves[0] ? farmDayOf(animal.moves[0].movedAt) : plan.startDay,
      ]
        .toSorted()
        .at(-1) ?? adaptationUntil
    ),
    readDays: farm.gainReadDays,
  });
  return gain;
};

export const animalPlanView = (
  animal: PlanningAnimal,
  plan: FeedingPlan,
  baseline: FeedingPlan,
  farm: PlanningFarm,
  now: Date,
  stock: PlanStock,
  activeRation: { rationId: string; assignedAt: Date } | null
) => {
  const today = farmDayOf(now);
  const latest = animal.weighIns.find(
    (reading) =>
      farmDayOf(reading.weighedAt) >= plan.startDay &&
      farmDayOf(reading.weighedAt) <= plan.saleDay
  );
  const measured = latest
    ? { day: farmDayOf(latest.weighedAt), weightKg: Number(latest.weightKg) }
    : { day: plan.startDay, weightKg: plan.startWeightKg };
  const fromDay = today > plan.startDay ? today : plan.startDay;
  const forecasts = FEED_PLAN_SCENARIOS.map((scenario) =>
    pricedForecast(
      forecastFeedingPlan(plan, scenario, {
        ...measured,
        includeFrom: fromDay,
      }),
      stock,
      plan.reservePercent
    )
  );
  const originals = FEED_PLAN_SCENARIOS.map((scenario) =>
    pricedForecast(
      forecastFeedingPlan(baseline, scenario),
      stock,
      baseline.reservePercent
    )
  );
  const adaptationUntil = addDays(plan.startDay, plan.adaptationDays);
  const matching =
    today < adaptationUntil && plan.arrival
      ? plan.arrival
      : (plan.stages.find(
          (stage) => bandStanding(measured.weightKg, stage.band) === "fits"
        ) ?? null);
  const gain = measuredPlanGain(animal, plan, farm, activeRation);
  const standing =
    gain && matching?.gain && activeRation?.rationId === matching.rationId
      ? gainStandingOf(gain.dailyGainKg, matching.gain)
      : null;
  const baselineAtReading =
    measured.day >= baseline.startDay && measured.day <= baseline.saleDay
      ? forecastFeedingPlan({ ...baseline, saleDay: measured.day }, "expected")
          .endWeightKg
      : null;
  const dueDay = addDays(measured.day, plan.reviewDays);
  return {
    measured,
    dueDay,
    weightOverdue: today >= dueDay && today < plan.saleDay,
    weightDifferenceKg:
      baselineAtReading === null
        ? null
        : Math.round((measured.weightKg - baselineAtReading) * 10) / 10,
    gain: gain
      ? { dailyGainKg: gain.dailyGainKg, overDays: gain.overDays }
      : null,
    standing,
    reviewRation: matching,
    rationMismatch:
      matching !== null && matching.rationId !== activeRation?.rationId,
    targetAtRisk: forecasts.some(
      (forecast) =>
        forecast.endWeightKg === null ||
        forecast.endWeightKg < plan.targetWeightKg
    ),
    finished: today >= plan.saleDay,
    forecasts,
    originals,
  };
};

const defaultPlanFor = (
  animal: PlanningAnimal,
  farm: PlanningFarm,
  now: Date
) => {
  const { intake } = animal;
  const [joining] = animal.joinings;
  return {
    startDay: intake
      ? farmDayOf(intake.arrivedAt)
      : (joining?.joinedOn ?? farmDayOf(now)),
    startWeightKg: intake
      ? Number(intake.weightKg)
      : Number(animal.weighIns[0]?.weightKg ?? joining?.weightKg ?? 0),
    saleDay:
      intake?.targetWindowStart ??
      joining?.targetWindowStart ??
      addDays(farmDayOf(now), 270),
    targetWeightKg: Number(
      intake?.targetWeightKg ?? joining?.targetWeightKg ?? 350
    ),
    adaptationDays: intake ? 21 : 0,
    transitionDays: 7,
    reviewDays: farm.gainReadDays,
    reservePercent: 10,
  };
};

const planRationsChanged = (
  plan: FeedingPlan | null,
  current: PlannedRation[]
): boolean => {
  if (!plan) {
    return false;
  }
  const rations = new Map(current.map((one) => [one.rationId, one]));
  return [...plan.stages, ...(plan.arrival ? [plan.arrival] : [])].some(
    (one) => {
      const latest = rations.get(one.rationId);
      return (
        latest?.versionId !== one.versionId ||
        latest?.band.fromKg !== one.band.fromKg ||
        latest?.band.toKg !== one.band.toKg ||
        latest?.gain?.lowKg !== one.gain?.lowKg ||
        latest?.gain?.highKg !== one.gain?.highKg
      );
    }
  );
};

export const feedingPlanDetail = async (
  db: Database,
  farm: PlanningFarm,
  now: Date,
  tagNumber: string
) => {
  const animal = await planningAnimal(db, farm.id, tagNumber, now);
  const [rows, options, stock, assigned] = await Promise.all([
    db.query.animalFeedPlan.findMany({
      where: { farmId: farm.id, animalId: animal.id },
      orderBy: { revision: "desc" },
    }),
    planningRations(db, farm, animal),
    planStock(db, farm, now),
    db.query.penRation.findFirst({
      where: { farmId: farm.id, penId: animal.penId },
    }),
  ]);
  const [latest] = rows;
  const original = rows.at(-1);
  const plan = latest ? planFromSnapshot(latest.snapshot) : null;
  const baseline = original ? planFromSnapshot(original.snapshot) : null;
  return {
    animalId: animal.id,
    tagNumber: animal.tagNumber,
    stillHere: isOnTheFarm(animal),
    options,
    defaults: defaultPlanFor(animal, farm, now),
    plan,
    rationsChanged: planRationsChanged(plan, options),
    planId: latest?.id ?? null,
    baseline,
    revisions: rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      createdAt: row.createdAt,
    })),
    view:
      plan && baseline
        ? animalPlanView(
            animal,
            plan,
            baseline,
            farm,
            now,
            stock,
            assigned ?? null
          )
        : null,
  };
};

/** All live fattening animals in one read. Feed is pooled across pens so the same stock is never promised twice. */
export const farmFeedingPlan = async (
  db: Database,
  farm: PlanningFarm,
  now: Date,
  month: string,
  scenario: FeedPlanScenario
) => {
  const [animals, revisions, stock, assigned] = await Promise.all([
    db.query.animal.findMany({
      where: { farmId: farm.id, side: "fattening" },
      with: {
        breed: { columns: { deshi: true, gainPercent: true } },
        intake: true,
        joinings: { orderBy: { joinedAt: "desc", id: "desc" }, limit: 1 },
        weighIns: {
          where: { flaggedNote: { isNull: true }, weighedAt: { lte: now } },
          columns: { weightKg: true, weighedAt: true },
          orderBy: { weighedAt: "desc", id: "desc" },
        },
      },
    }),
    db.query.animalFeedPlan.findMany({
      where: { farmId: farm.id },
      orderBy: { revision: "desc" },
    }),
    planStock(db, farm, now),
    db.query.penRation.findMany({ where: { farmId: farm.id } }),
  ]);
  const latest = new Map<string, (typeof revisions)[number]>();
  for (const revision of revisions) {
    if (!latest.has(revision.animalId)) {
      latest.set(revision.animalId, revision);
    }
  }
  const activeRations = new Map(
    assigned.map((row) => [row.penId, row.rationId])
  );
  const quantities = new Map<
    string,
    { required: number; withReserve: number; prior: number }
  >();
  let withoutPlan = 0;
  let incomplete = 0;
  const today = farmDayOf(now);
  const rows = animals.filter(isOnTheFarm).map((animal) => {
    const saved = latest.get(animal.id);
    if (!saved) {
      withoutPlan += 1;
      return {
        tagNumber: animal.tagNumber,
        penId: animal.penId,
        planned: false as const,
      };
    }
    const plan = planFromSnapshot(saved.snapshot);
    const reading = animal.weighIns.find(
      (one) =>
        farmDayOf(one.weighedAt) >= plan.startDay &&
        farmDayOf(one.weighedAt) <= plan.saleDay
    );
    const measured = reading
      ? {
          day: farmDayOf(reading.weighedAt),
          weightKg: Number(reading.weightKg),
        }
      : { day: plan.startDay, weightKg: plan.startWeightKg };
    const forecast = forecastFeedingPlan(plan, scenario, {
      ...measured,
      includeFrom: today,
    });
    if (forecast.stopped) {
      incomplete += 1;
    }
    for (const projected of forecast.months) {
      if (projected.month > month) {
        continue;
      }
      for (const feed of projected.feeds) {
        const totals = quantities.get(feed.feedItemId) ?? {
          required: 0,
          withReserve: 0,
          prior: 0,
        };
        const reserved = feed.quantity * (1 + plan.reservePercent / 100);
        if (projected.month === month) {
          totals.required += feed.quantity;
          totals.withReserve += reserved;
        } else {
          totals.prior += reserved;
        }
        quantities.set(feed.feedItemId, totals);
      }
    }
    const adaptationUntil = addDays(plan.startDay, plan.adaptationDays);
    const stage =
      today < adaptationUntil && plan.arrival
        ? plan.arrival
        : (plan.stages.find(
            (one) => bandStanding(measured.weightKg, one.band) === "fits"
          ) ?? null);
    return {
      tagNumber: animal.tagNumber,
      penId: animal.penId,
      planned: true as const,
      saleDay: plan.saleDay,
      endWeightKg: forecast.endWeightKg,
      targetWeightKg: plan.targetWeightKg,
      stopped: forecast.stopped,
      weightOverdue:
        today >= addDays(measured.day, plan.reviewDays) && today < plan.saleDay,
      rationMismatch:
        stage !== null && stage.rationId !== activeRations.get(animal.penId),
      finished: today >= plan.saleDay,
    };
  });
  let knownMoney = 0;
  let unpriced = 0;
  const lines = stock.flatMap((item) => {
    const demand = quantities.get(item.feedItemId);
    if (!demand || demand.required <= 0) {
      return [];
    }
    const required = plannedQuantity(demand.required, item.unit);
    const withReserve = plannedQuantity(demand.withReserve, item.unit);
    const availableNow = Math.max(0, item.onHand - item.expiredLeft);
    const carried = Math.max(0, availableNow - demand.prior);
    const toBuy = plannedQuantity(
      Math.max(0, demand.withReserve - carried),
      item.unit
    );
    const priceMoney = item.averagePriceMoney ?? item.fodderPriceMoney;
    const money = priceMoney === null ? null : roundMoney(toBuy * priceMoney);
    if (money === null) {
      unpriced += 1;
    } else {
      knownMoney += money;
    }
    return [
      {
        feedItemId: item.feedItemId,
        nameBn: item.nameBn,
        nameEn: item.nameEn,
        unit: item.unit,
        required,
        withReserve,
        availableNow,
        carried: plannedQuantity(carried, item.unit),
        toBuy,
        money,
        retired: item.retiredAt !== null,
      },
    ];
  });
  return {
    month,
    scenario,
    asOf: now,
    rows,
    lines,
    withoutPlan,
    incomplete,
    knownMoney: roundMoney(knownMoney),
    unpriced,
  };
};
