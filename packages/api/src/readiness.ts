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

/** What a server started against a database that is behind says before it stops: which migration, and what to run —
 *  on the farm's server the deploy runbook's command, which names the farm's database; the development one would
 *  migrate whatever database the machine it is typed on points at. */
export const DATABASE_IS_BEHIND = `The database has not applied ${LATEST_MIGRATION}, which this code was built for. Migrate it first. On the farm's server, as the deploy runbook says: PRODUCTION_DATABASE_URL=<the farm's owner URL> pnpm --filter @OpenFarm/db db:migrate:deploy. In development: pnpm --filter @OpenFarm/db db:migrate`;

/** What a server started with a login that may not read the farm's tables says before it stops. */
export const THE_APP_HAS_NO_RIGHTS =
  "The app's database login may not read the farm's tables. Run scripts/app-login-grants.sql as the database's owner after migrating (deploy runbook, \"The app's own login\"), then start again.";

/** PostgreSQL's code for a query refused for want of rights: the app's own login given none yet. */
const INSUFFICIENT_PRIVILEGE = "42501";

/** Whether PostgreSQL refused a query for want of rights, however deep the driver wrapped it. */
const isRefusedRights = (error: unknown): boolean => {
  for (let at = error; at instanceof Error; at = at.cause) {
    if ("code" in at && at.code === INSUFFICIENT_PRIVILEGE) {
      return true;
    }
  }
  return false;
};

/**
 * Why a built server may not start on this database, or nothing: behind the code, or reached with a login that may not
 * read it — which used to pass as "not behind", so the server came up and failed every turn and every request.
 */
export const whyTheDatabaseWillNotDo = async (
  url: string
): Promise<string | null> => {
  const db = createDb(url, { allowExitOnIdle: true });
  try {
    try {
      return (await schemaIsCurrent(db)) ? null : DATABASE_IS_BEHIND;
    } catch (error) {
      if (isMissingTable(error)) {
        return DATABASE_IS_BEHIND;
      }
      if (isRefusedRights(error)) {
        return THE_APP_HAS_NO_RIGHTS;
      }
      // Not reached at all: readiness answers that, and the server waits for the database rather than stopping.
      return null;
    }
  } finally {
    await db.$client.end();
  }
};
