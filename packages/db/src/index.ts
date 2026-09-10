import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

export interface DatabaseOptions {
  /** Let the process exit while the pool is idle instead of holding it open (test workers). */
  allowExitOnIdle?: boolean;
}

export const createDb = (
  url: string,
  { allowExitOnIdle = false }: DatabaseOptions = {}
): Database =>
  drizzle({
    connection: { connectionString: url, allowExitOnIdle },
    relations,
  });
