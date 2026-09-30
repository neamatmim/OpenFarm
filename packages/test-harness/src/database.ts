import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";

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
