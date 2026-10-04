import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

const CONNECTION_TIMEOUT_MS = 5000;

/**
 * How many connections one process holds at most. One server, one farm: requests, the scheduler and the sign-in share
 * this one pool, and a handful of staff never need more — while a managed database's small plan allows only a few
 * dozen, some of them its own.
 */
const POOL_MAX = 10;

/**
 * What every session is set to the moment it opens, ahead of anything else on it:
 *
 * - Every moment is kept as its UTC wall clock in a column without its zone, as drizzle writes a Date, so each session
 *   reads and defaults (`DEFAULT now()`) at UTC too, whatever the server or the address would set.
 * - No one statement runs past half a minute: a runaway report gives up rather than holding a connection, and with
 *   it a tenth of the pool, until the farm's requests queue behind it.
 * - No transaction is left open and idle past a minute, holding its locks and keeping vacuum from its work. The
 *   scheduler's day lock is the one that waits on purpose; it says so for its own transaction.
 */
const SESSION_SETTINGS = [
  "SET TIME ZONE 'UTC'",
  "SET statement_timeout = '30s'",
  "SET idle_in_transaction_session_timeout = '60s'",
].join("; ");

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
      max: POOL_MAX,
    },
    relations,
  });
  // A client runs what it is asked in order, so these are set before the first query anyone sends on it.
  db.$client.on("connect", (client) => {
    void client.query(SESSION_SETTINGS);
  });
  // A connection the database drops while it sits idle in the pool — a restart, a failover — is let go by the pool, and
  // the next request opens a new one. Said here rather than thrown at the process, which nothing would catch.
  db.$client.on("error", (error) => {
    console.error("database: an idle connection was dropped", error.message);
  });
  return db;
};

const shared = new Map<string, Database>();

/**
 * The one pool this process keeps for a database: the farm's requests, its scheduler and its sign-in all draw on it,
 * rather than each opening its own and tripling the connections the database is asked for.
 */
export const sharedDatabase = (url: string): Database => {
  const known = shared.get(url);
  if (known) {
    return known;
  }
  const db = createDb(url);
  shared.set(url, db);
  return db;
};
