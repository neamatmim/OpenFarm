import type { Database } from "@OpenFarm/db";
import type { EarlyLosses } from "@OpenFarm/domain";
import { earlyLosses } from "@OpenFarm/domain";

/** A year of buying: every Eid's worth of livestock markets and the sellers met at them. */
export const EARLY_LOSSES_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The animals bought over the last year, by seller and by livestock market, that died, were culled or were diagnosed within their
 * first thirty days, or whose first Weigh-in came under what they were bought at past the Owner's line — the Owner's
 * to read, never written on the animal.
 */
export const earlyLossesOf = async (
  db: Pick<Database, "query">,
  farm: { id: string; arrivalShortPercent: number },
  now: Date
): Promise<{
  bySeller: EarlyLosses[];
  byLivestockMarket: EarlyLosses[];
  days: number;
}> => {
  const farmId = farm.id;
  const from = new Date(now.getTime() - EARLY_LOSSES_DAYS * DAY_MS);
  const bought = await db.query.intake.findMany({
    where: { farmId, arrivedAt: { gte: from } },
    columns: { animalId: true, arrivedAt: true, weightKg: true },
    with: {
      seller: { columns: { name: true } },
      buyingTrip: { columns: { wentTo: true } },
    },
  });
  const ids = bought.map((one) => one.animalId);
  const deaths = await db.query.mortality.findMany({
    where: { farmId, animalId: { in: ids } },
    columns: { animalId: true, kind: true, happenedAt: true },
  });
  const diagnoses = await db.query.diagnosis.findMany({
    where: { farmId, animalId: { in: ids } },
    columns: { animalId: true, diagnosedAt: true },
  });
  // Every reading of these animals, oldest first, so the first of each is her first Weigh-in: one query, not one each.
  const readings = await db.query.weighIn.findMany({
    where: { farmId, animalId: { in: ids } },
    columns: { animalId: true, weightKg: true, weighedAt: true },
    orderBy: { weighedAt: "asc", id: "asc" },
  });
  const firstOf = new Map<string, { weightKg: number; at: Date }>();
  for (const one of readings) {
    if (!firstOf.has(one.animalId)) {
      firstOf.set(one.animalId, {
        weightKg: Number(one.weightKg),
        at: one.weighedAt,
      });
    }
  }
  const losses = earlyLosses(
    bought.map((one) => ({
      animalId: one.animalId,
      seller: one.seller?.name ?? null,
      livestockMarket: one.buyingTrip?.wentTo ?? null,
      arrivedAt: one.arrivedAt,
      arrivalKg: Number(one.weightKg),
      firstWeighIn: firstOf.get(one.animalId) ?? null,
    })),
    deaths.map((one) => ({
      animalId: one.animalId,
      kind: one.kind,
      at: one.happenedAt,
    })),
    diagnoses.map((one) => ({ animalId: one.animalId, at: one.diagnosedAt })),
    { from, until: now, shortPercent: farm.arrivalShortPercent }
  );
  return { ...losses, days: EARLY_LOSSES_DAYS };
};
