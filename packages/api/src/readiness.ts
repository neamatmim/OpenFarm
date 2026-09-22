import type { Database } from "@OpenFarm/db";
import { LATEST_MIGRATION } from "@OpenFarm/db/latest-migration";
import { sql } from "@OpenFarm/db/operators";

/**
 * Whether the database has applied the newest migration this code expects. Reading a table only proves some
 * migrations ran; a deploy that forgot the latest one would pass that and fail on the first request that needs it.
 */
export const schemaIsCurrent = async (
  db: Pick<Database, "execute">
): Promise<boolean> => {
  const applied = await db.execute(
    sql`select 1 from drizzle.__drizzle_migrations where name = ${LATEST_MIGRATION} limit 1`
  );
  return applied.rows.length > 0;
};
