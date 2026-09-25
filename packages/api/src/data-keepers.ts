import type { FieldValues } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Context } from "./context";
import { paperValues } from "./paper-values";

/** Who keeps the farm's records for it: the server's host, the nightly backup's keeper, and the backup's country. */
export interface DataKeepers {
  dataHost: string | null;
  backupStore: string | null;
  backupCountry: string | null;
}

/** A farm that has written none of them down yet. */
export const NO_KEEPERS: DataKeepers = {
  dataHost: null,
  backupStore: null,
  backupCountry: null,
};

/** A name the Owner writes, or nothing: blank is nothing, so the notice says it is missing. */
const keeperName = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .transform((name) => name || null);

/** The three as the Owner writes them down. */
export const dataKeepersInput = z.object({
  dataHost: keeperName,
  backupStore: keeperName,
  backupCountry: keeperName,
}) satisfies z.ZodType<DataKeepers, unknown>;

/** Who keeps the farm's records for it, as the privacy notice names them: what the Owner reads, and the trail's
 *  before and after. */
export const readKeepers = async (
  tx: Pick<Tx, "query">,
  farmId: string
): Promise<DataKeepers> => {
  const row = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { dataHost: true, backupStore: true, backupCountry: true },
  });
  return row ?? NO_KEEPERS;
};

/**
 * What the farm itself says on any paper: its name, address, phone and registration, who signs for it, and who keeps
 * its records — read fresh, as the privacy notice and a preview of any paper both need them.
 */
export const farmsOwnValues = async (
  db: Pick<Tx, "query">,
  farm: NonNullable<Context["farm"]>,
  ownerName: string
): Promise<FieldValues> =>
  paperValues({ farm, ownerName, keepers: await readKeepers(db, farm.id) });
