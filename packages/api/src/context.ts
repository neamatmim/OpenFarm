import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE, roleAssignment } from "@OpenFarm/db/schema/farm";
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
  /** Roles the signed-in person holds on the Farm; empty when signed out or disabled. */
  roles: RoleName[];
  /** Pens a Staff person is assigned to; used for scoping. */
  penIds: string[];
  /** Set by requireRole: the Role this request acts under. Null for role-free procedures. */
  roleUsed: RoleName | null;
}

let productionDb: Database | undefined;
const defaultDb = (): Database => {
  productionDb ??= createDb(env.DATABASE_URL);
  return productionDb;
};

/** A person who was invited before they signed up: grant the approved invites' Roles the
 *  first time we see them. Idempotent; audited as a system action. */
const grantPendingApprovals = async (
  db: Database,
  farmId: string,
  person: { id: string; email: string },
  now: Date
): Promise<RoleName[]> => {
  const approved = await db.query.invite.findMany({
    where: { farmId, email: person.email, status: "approved" },
    columns: { roles: true },
  });
  const roles = [...new Set(approved.flatMap((i) => i.roles))];
  if (roles.length === 0) {
    return [];
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(roleAssignment)
      .values(
        roles.map((role) => ({
          id: uuidv7(now),
          farmId,
          userId: person.id,
          role,
          grantedBy: null,
          grantedByRole: null,
          createdAt: now,
        }))
      )
      .onConflictDoNothing();
    await tx.insert(auditEvent).values({
      id: uuidv7(now),
      farmId,
      entity: "user",
      entityId: person.id,
      action: "update",
      actorId: null,
      roleUsed: null,
      recordedAt: now,
      receivedAt: now,
      before: { roles: [] },
      after: { roles, source: "approved invite" },
    });
  });
  return roles;
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
  const base = { auth: null, session, clock, db, roleUsed: null } as const;
  if (!session?.user) {
    return { ...base, farm: null, person: null, roles: [], penIds: [] };
  }

  const farm =
    (await db.query.farm.findFirst({ columns: { id: true, name: true } })) ??
    null;
  if (!farm) {
    return { ...base, farm, person: null, roles: [], penIds: [] };
  }

  const row = await db.query.user.findFirst({
    where: { id: session.user.id },
    columns: { id: true, email: true, disabledAt: true },
    with: {
      roles: {
        where: { farmId: farm.id, ...ACTIVE_ROLE },
        columns: { role: true },
      },
      penAssignments: { where: { farmId: farm.id }, columns: { penId: true } },
    },
  });
  const person = row ? { id: row.id, disabledAt: row.disabledAt } : null;
  if (!row || row.disabledAt) {
    return { ...base, farm, person, roles: [], penIds: [] };
  }

  let roles = row.roles.map((r) => r.role);
  if (roles.length === 0) {
    const everGranted = await db.query.roleAssignment.findFirst({
      where: { farmId: farm.id, userId: row.id },
      columns: { id: true },
    });
    if (!everGranted) {
      roles = await grantPendingApprovals(db, farm.id, row, clock.now());
    }
  }

  return {
    ...base,
    farm,
    person,
    roles,
    penIds: row.penAssignments.map((p) => p.penId),
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
