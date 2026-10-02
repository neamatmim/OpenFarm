import type { Database } from "@OpenFarm/db";
import { and, eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";

import type { Farm } from "./standing";

/**
 * One bull in Quarantine standing in a bull pen, as one put there before the farm marked its quarantine pens
 * would be — written straight into the database, because no door into Quarantine lets it happen now. The Pens page
 * names him for the Manager to walk in.
 */
export const leaveOneAstray = async (db: Database, farm: Farm) => {
  const one = await db.query.animal.findFirst({
    where: { farmId: farm.farmId, state: "quarantine" },
    columns: { id: true },
    orderBy: { tagNumber: "desc" },
  });
  if (!one) {
    return;
  }
  await db
    .update(animal)
    .set({ penId: farm.pens.bullsC })
    .where(and(eq(animal.id, one.id), eq(animal.farmId, farm.farmId)));
};
