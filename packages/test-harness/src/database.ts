import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";

let shared: Database | undefined;

/** The api suite's testTimeout (packages/api/vitest.config.ts). */
const TEST_TIMEOUT_MS = 30_000;

/** The scratch database for this test run (one per run; tests share it). */
export const scratchDb = (): Database => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set: is the test-harness global setup configured?"
    );
  }
  shared ??= createDb(url, {
    allowExitOnIdle: true,
    // As long as a test may take. A laptop busy with a build and the test database's own container can take more
    // than the server's five seconds to hand over a connection, and a test that failed for that failed for nothing.
    connectionTimeoutMs: TEST_TIMEOUT_MS,
  });
  return shared;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Writes what the database keeps as it was written — a Version's wording, the trail — the way a farm from before held
 * it, with its guards lifted for this one transaction only. For a test that stands a farm where it was before a change
 * reached it; never for a test of the app's own writes, which must meet the guards as the farm's do.
 */
export const asTheFarmHeldItBefore = async (
  write: (tx: Transaction) => Promise<unknown>
): Promise<void> => {
  await scratchDb().transaction(async (tx) => {
    // Replica sessions run no ordinary triggers: the guards stay on for every other connection.
    await tx.execute(sql`set local session_replication_role = replica`);
    await write(tx);
  });
};
