import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import { env } from "@OpenFarm/env/server";

import type { Clock } from "./clock";
import { systemClock } from "./clock";

export type Session = typeof auth.$Infer.Session;

export interface Context {
  auth: null;
  session: Session | null;
  clock: Clock;
  db: Database;
}

let productionDb: Database | undefined;
const defaultDb = (): Database => {
  productionDb ??= createDb(env.DATABASE_URL);
  return productionDb;
};

/** The one place a Context is assembled — production and tests both go through it. */
export const buildContext = ({
  session,
  clock,
  db,
}: {
  session: Session | null;
  clock: Clock;
  db: Database;
}): Context => ({ auth: null, session, clock, db });

export const createContext = async ({
  req,
  clock = systemClock,
  db = defaultDb(),
}: {
  req: Request;
  clock?: Clock;
  db?: Database;
}): Promise<Context> =>
  buildContext({
    session: await auth.api.getSession({ headers: req.headers }),
    clock,
    db,
  });
