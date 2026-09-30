import type { Database } from "@OpenFarm/db";
import type { EarlyLosses } from "@OpenFarm/domain";
import { earlyLosses } from "@OpenFarm/domain";

/** A year of buying: every Eid's worth of haats and the sellers met at them. */
export const EARLY_LOSSES_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The animals bought over the last year, by seller and by haat, that died, were culled or were diagnosed within their
 * first thirty days — the Owner's to read, never written on the animal.
 */
export const earlyLossesOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<{
  bySeller: EarlyLosses[];
  byHaat: EarlyLosses[];
  days: number;
}> => {
  const from = new Date(now.getTime() - EARLY_LOSSES_DAYS * DAY_MS);
  const bought = await db.query.intake.findMany({
    where: { farmId, arrivedAt: { gte: from } },
    columns: { animalId: true, arrivedAt: true },
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
  const losses = earlyLosses(
    bought.map((one) => ({
      animalId: one.animalId,
      seller: one.seller?.name ?? null,
      haat: one.buyingTrip?.wentTo ?? null,
      arrivedAt: one.arrivedAt,
    })),
    deaths.map((one) => ({
      animalId: one.animalId,
      kind: one.kind,
      at: one.happenedAt,
    })),
    diagnoses.map((one) => ({ animalId: one.animalId, at: one.diagnosedAt })),
    { from, until: now }
  );
  return { ...losses, days: EARLY_LOSSES_DAYS };
};
