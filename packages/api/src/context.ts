import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ASSIGNMENT } from "@OpenFarm/db/schema/herd";
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
import type { Scope } from "./scope";
import type { SmsTransport } from "./sms";
import { silentSms } from "./sms";
import { smsGateway } from "./sms-gateway";

export type Session = typeof auth.$Infer.Session;

export interface Person {
  id: string;
  name: string;
  /** The number the farm can text, when they have written one down. */
  phone: string | null;
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
    /** Where the farm is and how to reach it — the lines that appear on documents it sends out. */
    address: string | null;
    phone: string | null;
    /** The DLS registration an inspector asks for first, and when it runs out. */
    registrationNumber: string | null;
    registrationOffice: string | null;
    registrationIssuedOn: Date | null;
    registrationExpiresOn: Date | null;
    /** How early the farm wants to be told the registration is running out. */
    registrationRenewalLeadDays: number;
    /** What a bought-in fattening animal is fed towards unless the Manager says otherwise. */
    fatteningTargetWeightKg: number;
    /** The hours after a Heat within which the AI work is due, and after which it is late. */
    aiWindowStartHours: number;
    aiWindowEndHours: number;
    /** How long after an attempt's first service the Vet checks her, and how long a cow carries. */
    pregnancyCheckAfterDays: number;
    gestationDays: number;
    /** How long before Expected Calving a cow is dried off, and walked to the calving pen. */
    dryOffLeadDays: number;
    calvingPrepLeadDays: number;
    /** How many attempts that did not take raise a Repeat Breeder. */
    repeatBreederThreshold: number;
    /** The taka above which a Money Event waits for the Owner. */
    approvalThresholdBdt: number;
    /** What part of a Venture's target capital is the least worth starting on. */
    ventureFloorPercent: number;
    /** What part of a Venture's capital keeps the animals rather than buying them. */
    ventureRunningPercent: number;
    /** The days a Venture keeps selling after its window before the Farm buys the rest. */
    windUpDays: number;
    /** How many Investors the Farm may have at a time, and where it starts warning. */
    investorCap: number;
    investorWarnAt: number;
    pinAutoLockMinutes: number;
    milkTolerancePercent: number;
    feedTolerancePercent: number;
    escalationMinutes: number;
    staffCorrectionHours: number;
    managerCorrectionDays: number;
    clockSkewMinutes: number;
    /** When the day's quieter notices are carried, and when the farm is asleep. */
    digestTimes: string[];
    quietFrom: string;
    quietUntil: string;
    alertsSweptFrom: Date | null;
  } | null;
  person: Person | null;
  /** Roles the signed-in person holds on the Farm; empty when signed out or disabled. */
  roles: RoleName[];
  /** Pens a Staff person is assigned to; used for scoping. */
  penIds: string[];
  /** A Vet called in for a visit, who reaches only the animals on their open Cases — and, for them, those animals. */
  visiting: boolean;
  caseAnimalIds: string[];
  /** Set by requireRole: the Role this request acts under. Null for role-free procedures. */
  roleUsed: RoleName | null;
  /** Set by requireRole: what they may see and record under that Role. Nothing, for role-free procedures. */
  scope: Scope;
  /** How a notice leaves the farm. Injected so the tests can watch it and development can
   *  run silent (ticket 14). */
  push: PushTransport;
  /** How a text message leaves the farm, for the two notices worth one. Injected the same way,
   *  so the path is built and tested before the farm has an account with a gateway. */
  sms: SmsTransport;
  /** The public half of the farm's push keys — the part a browser needs and anyone may see.
   *  Carried here so no router has to reach into the server's secrets to find it. */
  pushKey: string | null;
}

let productionSms: SmsTransport | undefined;
/** Made once, like the push keys: reading the Owner's gateway credentials is a one-time act. */
const defaultSms = (): SmsTransport => {
  productionSms ??= smsGateway();
  return productionSms;
};

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

/** The database and the ways a notice leaves the farm, as the running server has them — for work the server does on
 *  its own timer rather than for a request. */
export const productionWiring = () => ({
  db: defaultDb(),
  push: defaultPush(),
  sms: defaultSms(),
});

/**
 * The Farm this request acts on: the phone's own, the one the caller was told, or — for a request that says nothing,
 * which is every request on a farm running its own install — the single Farm that exists.
 *
 * A Shed Phone's own farm comes first and cannot be talked out of: a phone belongs to the farm it was enrolled on,
 * and nothing a caller passes may move it to another. Anything else that knows which farm says so, which is how the
 * tests work, each file on a farm of its own.
 */
const resolveFarm = (
  db: Database,
  device: DeviceSession | null,
  named: string | null
) => {
  const which = device?.farmId ?? named;
  return which
    ? db.query.farm.findFirst({ where: { id: which } })
    : db.query.farm.findFirst();
};

const resolvePerson = (db: Database, userId: string, farmId: string) =>
  db.query.user.findFirst({
    where: { id: userId },
    columns: {
      id: true,
      name: true,
      email: true,
      phone: true,
      disabledAt: true,
    },
    with: {
      roles: {
        where: { farmId, ...ACTIVE_ROLE },
        columns: { role: true, scope: true, expiresAt: true },
      },
      penAssignments: {
        where: { farmId, ...ACTIVE_ASSIGNMENT },
        columns: { penId: true },
      },
    },
  });

/**
 * The first person on a new install signs up before there is a Farm to belong to. They are still themselves — with
 * no Farm and no Roles — so they can be told there is no farm yet and name it (farm.bootstrap). A Shed Phone always
 * belongs to a Farm, so this is a personal session's case alone.
 */
const firstPersonOf = (
  session: Session | null,
  device: DeviceSession | null
): { id: string; name: string } | null =>
  session && !device ? { id: session.user.id, name: session.user.name } : null;

/** The one place a Context is assembled — production and tests both go through it.
 *  Resolves the Farm, the person, their Roles and Pen Assignments from the database. */
export const buildContext = async ({
  session,
  device = null,
  deviceStatus = device ? "ok" : "none",
  clock,
  db,
  push = silentTransport,
  sms = silentSms,
  pushKey = null,
  farmId = null,
}: {
  session: Session | null;
  device?: DeviceSession | null;
  deviceStatus?: DeviceStatus;
  clock: Clock;
  db: Database;
  push?: PushTransport;
  sms?: SmsTransport;
  pushKey?: string | null;
  /** Which Farm this request acts on, for a caller that knows. Nothing for a request on a farm's own install. */
  farmId?: string | null;
}): Promise<Context> => {
  const base = {
    auth: null,
    session,
    clock,
    db,
    push,
    sms,
    pushKey,
    roleUsed: null,
    scope: { kind: "nothing" },
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
    visiting: false,
    caseAnimalIds: [],
  };

  // A phone with nobody PIN-switched in still needs its Farm, so it can fetch the roster
  // it checks PINs against.
  const farm = (await resolveFarm(db, device, farmId)) ?? null;
  if (!farm) {
    return { ...empty, actor: firstPersonOf(session, device) };
  }
  if (!actingUserId) {
    return { ...empty, farm };
  }

  const row = await resolvePerson(db, actingUserId, farm.id);
  const person = row
    ? {
        id: row.id,
        name: row.name,
        phone: row.phone,
        disabledAt: row.disabledAt,
      }
    : null;
  if (!row || row.disabledAt) {
    return { ...empty, farm, person };
  }

  // Roles come from an invite only when the person takes it up with its code (people.acceptInvite): an email
  // matching an invite proves nothing about who signed up with it.
  // A visit's access ends on its day, whether or not the schedule has got round to revoking it yet.
  const now = clock.now();
  const standing = row.roles.filter((r) => !r.expiresAt || r.expiresAt > now);
  const roles = standing.map((r) => r.role);
  const visiting = standing.some(
    (r) => r.role === "vet" && r.scope === "visiting"
  );
  const cases = visiting
    ? await db.query.vetCase.findMany({
        where: { farmId: farm.id, vetId: row.id, closedAt: { isNull: true } },
        columns: { animalId: true },
      })
    : [];

  return {
    ...base,
    device: deviceInfo,
    actor: { id: row.id, name: row.name },
    farm,
    person,
    roles,
    penIds: row.penAssignments.map((p) => p.penId),
    visiting,
    caseAnimalIds: cases.map((c) => c.animalId),
  };
};

export const createContext = async ({
  req,
  clock = systemClock,
  db = defaultDb(),
  push = defaultPush(),
  sms = defaultSms(),
  pushKey = env.VAPID_PUBLIC_KEY ?? null,
}: {
  req: Request;
  clock?: Clock;
  db?: Database;
  push?: PushTransport;
  sms?: SmsTransport;
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
      sms,
      pushKey,
    });
  }
  return buildContext({
    session: await auth.api.getSession({ headers: req.headers }),
    clock,
    db,
    push,
    sms,
    pushKey,
  });
};
