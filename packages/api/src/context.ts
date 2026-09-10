import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { env } from "@OpenFarm/env/server";

import type { Clock } from "./clock";
import { systemClock } from "./clock";

export type Session = typeof auth.$Infer.Session;

export interface Person {
  id: string;
  disabledAt: Date | null;
}

export interface Context {
  auth: null;
  session: Session | null;
  clock: Clock;
  db: Database;
  /** The Farm this request acts on; null until the farm is bootstrapped. */
  farm: { id: string; name: string } | null;
  person: Person | null;
  /** Roles the signed-in person holds on the Farm; empty when signed out. */
  roles: RoleName[];
  /** Pens a Staff person is assigned to; used for scoping. */
  penIds: string[];
}

let productionDb: Database | undefined;
const defaultDb = (): Database => {
  productionDb ??= createDb(env.DATABASE_URL);
  return productionDb;
};

/** The one place a Context is assembled — production and tests both go through it.
 *  Resolves the Farm, the person, their Roles and Pen Assignments from the database. */
export const buildContext = async ({
  session,
  clock,
  db,
}: {
  session: Session | null;
  clock: Clock;
  db: Database;
}): Promise<Context> => {
  const farmRow = await db.query.farm.findFirst({
    columns: { id: true, name: true },
  });
  const farm = farmRow ?? null;

  if (!session?.user || !farm) {
    return {
      auth: null,
      session,
      clock,
      db,
      farm,
      person: null,
      roles: [],
      penIds: [],
    };
  }

  const row = await db.query.user.findFirst({
    where: { id: session.user.id },
    columns: { id: true, disabledAt: true },
    with: {
      roles: { where: { farmId: farm.id }, columns: { role: true } },
      penAssignments: { where: { farmId: farm.id }, columns: { penId: true } },
    },
  });

  return {
    auth: null,
    session,
    clock,
    db,
    farm,
    person: row ? { id: row.id, disabledAt: row.disabledAt } : null,
    roles: row?.roles.map((r) => r.role) ?? [],
    penIds: row?.penAssignments.map((p) => p.penId) ?? [],
  };
};

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
