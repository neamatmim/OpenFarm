import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
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

/** PostgreSQL's code for a table that does not exist: here, a database no migration has ever run against. */
const UNDEFINED_TABLE = "42P01";

/** Whether PostgreSQL itself refused a query for naming a table it does not have, however deep the driver wrapped it. */
const isMissingTable = (error: unknown): boolean => {
  for (let at = error; at instanceof Error; at = at.cause) {
    if ("code" in at && at.code === UNDEFINED_TABLE) {
      return true;
    }
  }
  return false;
};

/**
 * Whether this database answers and is behind the code — the one thing a server refuses to start over. One that has
 * never been migrated is behind too: it has no record of migrations to be asked.
 *
 * A database that cannot be reached is not this question: readiness answers that, and a server that stopped whenever
 * PostgreSQL was a second slow to come up would be a worse server, not a safer one.
 */
export const isBehind = async (
  db: Pick<Database, "execute">
): Promise<boolean> => {
  try {
    return !(await schemaIsCurrent(db));
  } catch (error) {
    return isMissingTable(error);
  }
};

/** {@link isBehind}, asked of the database at this address on a connection of its own, closed before it answers. */
export const databaseIsBehind = async (url: string): Promise<boolean> => {
  const db = createDb(url, { allowExitOnIdle: true });
  try {
    return await isBehind(db);
  } finally {
    await db.$client.end();
  }
};

/** What a server started against a database that is behind says before it stops: which migration, and what to run. */
export const DATABASE_IS_BEHIND = `The database has not applied ${LATEST_MIGRATION}, which this code was built for. Migrate it first: pnpm --filter @OpenFarm/db db:migrate`;
