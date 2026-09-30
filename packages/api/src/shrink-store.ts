import type { Database } from "@OpenFarm/db";
import type { Shrink } from "@OpenFarm/domain";
import { shrinkOf } from "@OpenFarm/domain";

import type { Tx } from "./audit";

// Shrink: what an animal weighed last on the farm against what the sale's scale said. Her last weighing is her last
// Weigh-in before the moment asked about, or else the weight she came in at.

type Db = Pick<Database, "query"> | Tx;

/** Each animal's last weighing before the moment asked for her: her last Weigh-in, or else her Intake's weight. */
export const lastWeighingsBefore = async (
  db: Db,
  farmId: string,
  wanted: readonly { animalId: string; at: Date }[]
): Promise<Map<string, { kg: number; at: Date }>> => {
  const found = new Map<string, { kg: number; at: Date }>();
  if (wanted.length === 0) {
    return found;
  }
  const ids = [...new Set(wanted.map((one) => one.animalId))];
  const [readings, intakes] = [
    await db.query.weighIn.findMany({
      where: { farmId, animalId: { in: ids } },
      columns: { animalId: true, weightKg: true, weighedAt: true },
      orderBy: { weighedAt: "asc", id: "asc" },
    }),
    await db.query.intake.findMany({
      where: { farmId, animalId: { in: ids } },
      columns: { animalId: true, weightKg: true, arrivedAt: true },
    }),
  ];
  for (const { animalId, at } of wanted) {
    const came = intakes.find((one) => one.animalId === animalId);
    let last =
      came && came.arrivedAt <= at
        ? { kg: Number(came.weightKg), at: came.arrivedAt }
        : null;
    for (const one of readings) {
      if (one.animalId === animalId && one.weighedAt <= at) {
        last = { kg: Number(one.weightKg), at: one.weighedAt };
      }
    }
    if (last) {
      found.set(animalId, last);
    }
  }
  return found;
};

/** The shrink of each Sale, by its animal: her last weighing before she went against the weight she was sold at. */
export const shrinkOfSales = async (
  db: Db,
  farmId: string,
  sales: readonly { animalId: string; weightKg: number; soldAt: Date }[]
): Promise<Map<string, Shrink | null>> => {
  const last = await lastWeighingsBefore(
    db,
    farmId,
    sales.map((one) => ({ animalId: one.animalId, at: one.soldAt }))
  );
  return new Map(
    sales.map((one) => {
      const before = last.get(one.animalId);
      return [
        one.animalId,
        before
          ? shrinkOf({
              lastKg: before.kg,
              lastAt: before.at,
              saleKg: one.weightKg,
              saleAt: one.soldAt,
            })
          : null,
      ];
    })
  );
};
