import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

const CONNECTION_TIMEOUT_MS = 5000;

export interface DatabaseOptions {
  /** Let the process exit while the pool is idle instead of holding it open (test workers). */
  allowExitOnIdle?: boolean;
}

export const createDb = (
  url: string,
  { allowExitOnIdle = false }: DatabaseOptions = {}
): Database =>
  drizzle({
    connection: {
      connectionString: url,
      allowExitOnIdle,
      // Readiness and ordinary requests should fail clearly when PostgreSQL is
      // unreachable, not hold a socket open until the operating system gives up.
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    },
    relations,
  });
