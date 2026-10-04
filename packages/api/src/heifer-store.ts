import type { Database } from "@OpenFarm/db";
import type { HeiferGrowth } from "@OpenFarm/domain";
import { heiferGrowthOf } from "@OpenFarm/domain";

/** A heifer on the farm, and how she is growing toward her first service. */
export interface HeiferRow {
  tagNumber: string;
  bornAt: Date | null;
  deshi: boolean;
  growth: HeiferGrowth;
}

/**
 * Every heifer on the Dairy side not yet in calf, with her growth toward the weight DLS has her served at (domain
 * `heifer-growth.ts`) — those who will fall short first, then the youngest last. A reading the farm doubted is left
 * out: a gain read from it would be a gain nobody believes.
 */
export const heifersOn = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<HeiferRow[]> => {
  const rows = await db.query.animal.findMany({
    where: { farmId, side: "dairy", state: "heifer" },
    columns: { tagNumber: true, birthDate: true },
    with: {
      breed: { columns: { deshi: true } },
      weighIns: {
        where: { flaggedNote: { isNull: true } },
        columns: { weightKg: true, weighedAt: true },
      },
    },
  });
  const heifers = rows.map((one) => {
    const deshi = one.breed?.deshi === true;
    return {
      tagNumber: one.tagNumber,
      bornAt: one.birthDate,
      deshi,
      growth: heiferGrowthOf(
        {
          bornAt: one.birthDate,
          deshi,
          weights: one.weighIns.map((reading) => ({
            weightKg: Number(reading.weightKg),
            weighedAt: reading.weighedAt,
          })),
        },
        now
      ),
    };
  });
  return heifers.toSorted(
    (a, b) =>
      Number(b.growth.behind) - Number(a.growth.behind) ||
      (b.growth.ageDays ?? -1) - (a.growth.ageDays ?? -1) ||
      a.tagNumber.localeCompare(b.tagNumber)
  );
};
