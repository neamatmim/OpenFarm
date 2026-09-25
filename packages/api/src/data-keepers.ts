import type { Tx } from "./audit";

/** Who keeps the farm's records for it, as the privacy notice names them: what the Owner reads, and the trail's before
 *  and after. */
export const readKeepers = async (tx: Pick<Tx, "query">, farmId: string) => {
  const row = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { dataHost: true, backupStore: true, backupCountry: true },
  });
  return row ?? null;
};
