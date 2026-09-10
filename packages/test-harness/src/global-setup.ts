// Vitest global setup: one scratch PostgreSQL per test run, migrated before any worker starts.
// Runs in the main process; workers spawn afterwards and inherit DATABASE_URL from it.
import path from "node:path";

// Import the relations module directly: the db package's entry point reads the
// app env at import time, and no DATABASE_URL exists until the container is up.
import { relations } from "@OpenFarm/db/relations";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const POSTGRES_IMAGE = "postgres:18";
const MIGRATIONS_FOLDER = path.resolve(
  import.meta.filename,
  "../../../db/src/migrations"
);

const setup = async (): Promise<() => Promise<void>> => {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(`openfarm_test_${Date.now()}`)
    .start();
  const databaseUrl = container.getConnectionUri();

  const db = drizzle(databaseUrl, { relations });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await db.$client.end();

  process.env.DATABASE_URL = databaseUrl;

  return async () => {
    await container.stop();
  };
};

export default setup;
