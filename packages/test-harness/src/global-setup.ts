// Vitest global setup: one scratch PostgreSQL per test run, migrated before any worker starts.
// Runs in the main process; workers spawn afterwards and inherit DATABASE_URL from it.
import path from "node:path";

import { createDb } from "@OpenFarm/db";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const POSTGRES_IMAGE = "postgres:18";
const MIGRATIONS_FOLDER = path.resolve(
  import.meta.dirname,
  "../../db/src/migrations"
);

const setup = async (): Promise<() => Promise<void>> => {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(`openfarm_test_${Date.now()}`)
    .start();
  const databaseUrl = container.getConnectionUri();

  try {
    const db = createDb(databaseUrl);
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await db.$client.end();
    }
  } catch (error) {
    await container.stop();
    throw error;
  }

  process.env.DATABASE_URL = databaseUrl;

  return async () => {
    await container.stop();
  };
};

export default setup;
