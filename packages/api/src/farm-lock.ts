import type { Database } from "@OpenFarm/db";
import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";

/** A transaction, as `audit` names it: said here from the database's own, as the audited write takes this lock. */
type Locking = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Every count a Venture's rules make — Units taken, what a budget still holds, what a Float is owed — reads rows that
 * another request may be writing; and a **Closed Month** asks what of it still waits while money may be written into
 * it. One lock on the Farm, taken at the start of every write that can reach the Farm's money — every audited write,
 * every Correction (ADR 0028) — before any row of its own, is what makes those counts still true when the write lands,
 * and orders every such write the same way, so none waits on another that waits on it. Taken again in the same
 * transaction, it is already held. Kept apart so the stores that take it need not read each other.
 */
export const lockTheFarm = async (tx: Locking, farmId: string) => {
  await tx
    .select({ id: farm.id })
    .from(farm)
    .where(eq(farm.id, farmId))
    .for("update");
};
