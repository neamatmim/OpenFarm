import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

const CONNECTION_TIMEOUT_MS = 5000;

export interface DatabaseOptions {
  /** Let the process exit while the pool is idle instead of holding it open (test workers). */
  allowExitOnIdle?: boolean;
  /** How long to wait for a connection before giving up. Five seconds unless said otherwise. */
  connectionTimeoutMs?: number;
}

export const createDb = (
  url: string,
  {
    allowExitOnIdle = false,
    connectionTimeoutMs = CONNECTION_TIMEOUT_MS,
  }: DatabaseOptions = {}
): Database => {
  const db = drizzle({
    connection: {
      connectionString: url,
      allowExitOnIdle,
      // Readiness and ordinary requests should fail clearly when PostgreSQL is
      // unreachable, not hold a socket open until the operating system gives up.
      connectionTimeoutMillis: connectionTimeoutMs,
    },
    relations,
  });
  // Every moment is kept as its UTC wall clock in a column without its zone, as drizzle writes a Date: each session
  // reads and defaults (`DEFAULT now()`) at UTC too, whatever the server or the address would set. Sent the moment a
  // connection opens, ahead of anything else on it.
  db.$client.on("connect", (client) => {
    void client.query("SET TIME ZONE 'UTC'");
  });
  return db;
};
