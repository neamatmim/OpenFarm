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
import type { DeviceSession, DeviceStatus } from "./device";
import {
  DEVICE_TOKEN_HEADER,
  SWITCH_TOKEN_HEADER,
  resolveDeviceSession,
} from "./device";
import type { PushTransport } from "./push";
import { silentTransport } from "./push";
import { webPush } from "./push-web";

export type Session = typeof auth.$Infer.Session;

export interface Person {
  id: string;
  name: string;
  disabledAt: Date | null;
}

/** The two principals (ADR 0003): a personal session, or a Shed Phone's device session with
 *  a PIN-switched active user. Either way `actor` is the person the write is attributed to. */
export interface Actor {
  id: string;
  name: string;
}

export interface Device {
  id: string;
  name: string;
  farmId: string;
}

export interface Context {
  auth: null;
  /** A personal Better Auth session. Null on a Shed Phone. */
  session: Session | null;
  /** The Shed Phone this request came from. Null for a personal session. */
  device: Device | null;
  /** Why the phone's token did not resolve, so its own screen can say what to do. */
  deviceStatus: DeviceStatus;
  /** Who this write is attributed to, whichever principal it arrived by. */
  actor: Actor | null;
  clock: Clock;
  db: Database;
  /** The Farm this request acts on; null until the farm is bootstrapped. */
  farm: {
    id: string;
    name: string;
    pinAutoLockMinutes: number;
    milkTolerancePercent: number;
    escalationMinutes: number;
    staffCorrectionHours: number;
    managerCorrectionDays: number;
    clockSkewMinutes: number;
    alertsSweptFrom: Date | null;
  } | null;
  person: Person | null;
  /** Roles the signed-in person holds on the Farm; empty when signed out or disabled. */
  roles: RoleName[];
  /** Pens a Staff person is assigned to; used for scoping. */
  penIds: string[];
  /** Set by requireRole: the Role this request acts under. Null for role-free procedures. */
  roleUsed: RoleName | null;
  /** How a notice leaves the farm. Injected so the tests can watch it and development can
   *  run silent (ticket 14). */
  push: PushTransport;
  /** The public half of the farm's push keys — the part a browser needs and anyone may see.
   *  Carried here so no router has to reach into the server's secrets to find it. */
  pushKey: string | null;
}

let productionPush: PushTransport | undefined;
/** Made once: setting the farm's keys is a one-time act, not a per-request one. */
const defaultPush = (): PushTransport => {
  productionPush ??= webPush();
  return productionPush;
};

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
/** The Farm this request acts on: the phone's own Farm, or the single Farm that exists. */
const resolveFarm = (db: Database, device: DeviceSession | null) =>
  device
    ? db.query.farm.findFirst({ where: { id: device.farmId } })
    : db.query.farm.findFirst();

const resolvePerson = (db: Database, userId: string, farmId: string) =>
  db.query.user.findFirst({
    where: { id: userId },
    columns: { id: true, name: true, email: true, disabledAt: true },
    with: {
      roles: { where: { farmId, ...ACTIVE_ROLE }, columns: { role: true } },
      penAssignments: { where: { farmId }, columns: { penId: true } },
    },
  });

/** The one place a Context is assembled — production and tests both go through it.
 *  Resolves the Farm, the person, their Roles and Pen Assignments from the database. */
export const buildContext = async ({
  session,
  device = null,
  deviceStatus = device ? "ok" : "none",
  clock,
  db,
  push = silentTransport,
  pushKey = null,
}: {
  session: Session | null;
  device?: DeviceSession | null;
  deviceStatus?: DeviceStatus;
  clock: Clock;
  db: Database;
  push?: PushTransport;
  pushKey?: string | null;
}): Promise<Context> => {
  const base = {
    auth: null,
    session,
    clock,
    db,
    push,
    pushKey,
    roleUsed: null,
    deviceStatus,
  } as const;
  const actingUserId = session?.user.id ?? device?.activeUserId ?? null;
  const deviceInfo = device
    ? { id: device.id, name: device.name, farmId: device.farmId }
    : null;
  const empty = {
    ...base,
    device: deviceInfo,
    actor: null,
    farm: null,
    person: null,
    roles: [],
    penIds: [],
  };

  // A phone with nobody PIN-switched in still needs its Farm, so it can fetch the roster
  // it checks PINs against.
  const farm = (await resolveFarm(db, device)) ?? null;
  if (!(actingUserId && farm)) {
    return { ...empty, farm };
  }

  const row = await resolvePerson(db, actingUserId, farm.id);
  const person = row
    ? { id: row.id, name: row.name, disabledAt: row.disabledAt }
    : null;
  if (!row || row.disabledAt) {
    return { ...empty, farm, person };
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
    device: deviceInfo,
    actor: { id: row.id, name: row.name },
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
  push = defaultPush(),
  pushKey = env.VAPID_PUBLIC_KEY ?? null,
}: {
  req: Request;
  clock?: Clock;
  db?: Database;
  push?: PushTransport;
  pushKey?: string | null;
}): Promise<Context> => {
  const token = req.headers.get(DEVICE_TOKEN_HEADER);
  if (token) {
    const resolved = await resolveDeviceSession(
      db,
      token,
      req.headers.get(SWITCH_TOKEN_HEADER),
      clock.now()
    );
    return buildContext({
      session: null,
      device: resolved?.device ?? null,
      clock,
      db,
      push,
      pushKey,
    });
  }
  return buildContext({
    session: await auth.api.getSession({ headers: req.headers }),
    clock,
    db,
    push,
    pushKey,
  });
};
