import { env } from "@OpenFarm/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

export const createDb = (url: string = env.DATABASE_URL): Database =>
  drizzle(url, { relations });

export const db: Database = createDb();
