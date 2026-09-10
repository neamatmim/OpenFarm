import { createDb } from "@OpenFarm/db";
import type { Database } from "@OpenFarm/db";

let shared: Database | undefined;

/** The scratch database for this test run (one per run; tests share it). */
export const scratchDb = (): Database => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set: is the test-harness global setup configured?"
    );
  }
  shared ??= createDb(url);
  return shared;
};
