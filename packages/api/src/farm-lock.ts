import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";

import type { Tx } from "./audit";

/**
 * Every count a Venture's rules make — Units taken, what a budget still holds, what a Float is owed — reads
 * rows that another request may be writing; and a **Closed Month** asks what of it still waits while money may be
 * booked into it. One lock on the Farm, taken first by everything that writes a Venture's money or touches a month
 * gone by, is what makes those counts still true when the write lands. Kept apart so the stores that take it need
 * not read each other.
 */
export const lockTheFarm = async (tx: Tx, farmId: string) => {
  await tx
    .select({ id: farm.id })
    .from(farm)
    .where(eq(farm.id, farmId))
    .for("update");
};
