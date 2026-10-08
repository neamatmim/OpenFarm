import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { sharedDatabase } from "@OpenFarm/db";
import type { RoleName, farm as farmTable } from "@OpenFarm/db/schema/farm";
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
import type { EmailTransport } from "./email";
import { silentEmail } from "./email";
import { emailGateway } from "./email-gateway";
import { settleFarmLocale } from "./farm-locale";
import type { PushTransport } from "./push";
import { silentTransport } from "./push";
import { webPush } from "./push-web";
import type { Scope } from "./scope";
import type { SmsTransport } from "./sms";
import { silentSms } from "./sms";
import { smsGateway } from "./sms-gateway";

// Where the farm is, before a request, the schedule or the seed reads a sum or a day.
settleFarmLocale();

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

/** The farm's row, every column of it, as the schema declares it. */
type FarmRow = (typeof farmTable)["$inferSelect"];

export interface Context {
  auth: null;
  /** A personal Better Auth session. Null on a Shed Phone. */
  session: Session | null;
  /** The Shed Phone this request came from. Null for a personal session. */
  device: Device | null;
  /** Why the phone's token did not resolve, so its own screen can say what to do. */
  deviceStatus: DeviceStatus;
  /** Where the request came from, as the proxy in front of the app tells it — so a stranger's wrong guesses are
   *  counted against the stranger, not the farm. Null when nothing says. */
  callerAddress: string | null;
  /** The browser the request came from, as it names itself: kept with an agreement sealed by a code, as part of the
   *  farm's proof of who agreed (ADR 0022). Null for a caller that says nothing. */
  callerAgent: string | null;
  /** Who this write is attributed to, whichever principal it arrived by. */
  actor: Actor | null;
  clock: Clock;
  db: Database;
  /** The Farm this request acts on, its row as it stood when the request arrived — what each column means is said on
   *  the schema; null until the farm is bootstrapped. Read again behind the farm's lock where a write depends on it. */
  farm: FarmRow | null;
  person: Person | null;
  /** Roles the signed-in person holds on the Farm; empty when signed out or disabled. On a Shed Phone, Barn Staff
   *  alone, whatever else they hold. */
  roles: RoleName[];
  /** On a Shed Phone, the Roles they hold away from it — so what they could do from their own phone is refused as
   *  that, not as a Role they lack. Empty off a Shed Phone, where `roles` is all of them. */
  rolesOffThePhone: RoleName[];
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
  /** How an email leaves the farm: the codes an Investor confirms their email with. Injected the same way. */
  email: EmailTransport;
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

let productionEmail: EmailTransport | undefined;
/** Made once: the farm's mail account is read and connected to once. */
const defaultEmail = (): EmailTransport => {
  productionEmail ??= emailGateway();
  return productionEmail;
};

let productionPush: PushTransport | undefined;
/** Made once: setting the farm's keys is a one-time act, not a per-request one. */
const defaultPush = (): PushTransport => {
  productionPush ??= webPush();
  return productionPush;
};

/** The process-wide database pool used by requests, the scheduler, the sign-in and readiness checks. */
export const productionDatabase = (): Database =>
  sharedDatabase(env.DATABASE_URL);

/** The database and the ways a notice leaves the farm, as the running server has them — for work the server does on
 *  its own timer rather than for a request. */
export const productionWiring = () => ({
  db: productionDatabase(),
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

/**
 * What a person may do on the farm today: the Roles still standing, whether one is a Vet's visit, and the Cases that
 * visit is for.
 *
 * Roles come from an invite only when the person takes it up with its code (people.acceptInvite): an email matching
 * an invite proves nothing about who signed up with it. A visit's access ends on its day, whether or not the schedule
 * has got round to revoking it yet.
 */
const accessOf = async (
  db: Database,
  farmId: string,
  person: {
    id: string;
    roles: readonly {
      role: RoleName;
      scope: string | null;
      expiresAt: Date | null;
    }[];
  },
  now: Date
) => {
  const standing = person.roles.filter(
    (one) => !one.expiresAt || one.expiresAt > now
  );
  const visiting = standing.some(
    (one) => one.role === "vet" && one.scope === "visiting"
  );
  const cases = visiting
    ? await db.query.vetCase.findMany({
        where: { farmId, vetId: person.id, closedAt: { isNull: true } },
        columns: { animalId: true },
      })
    : [];
  return {
    roles: standing.map((one) => one.role),
    visiting,
    caseAnimalIds: cases.map((one) => one.animalId),
  };
};

/**
 * What a person may do as they work now. On a Shed Phone they are Barn Staff and nothing more, whatever else they hold:
 * the barn's phone is picked up by whoever is there (the Owner's decision of 2026-10-04). What they hold away from it
 * is kept beside, so what they could do from their own phone is refused as that.
 */
const asTheyWork = (
  access: { roles: RoleName[]; visiting: boolean; caseAnimalIds: string[] },
  // A personal session wins over a phone: the request is the person's own.
  { device, session }: { device: unknown; session: unknown }
) =>
  device && !session
    ? {
        roles: access.roles.filter((role) => role === "staff"),
        rolesOffThePhone: access.roles,
        visiting: false,
        caseAnimalIds: [],
      }
    : { ...access, rolesOffThePhone: [] };

/** The Pens somebody kept up to the moment they left: those still assigned, and those leaving itself ended. */
const pensKeptUntil = async (
  db: Database,
  farmId: string,
  userId: string,
  left: Date
): Promise<string[]> => {
  const rows = await db.query.penAssignment.findMany({
    where: {
      farmId,
      userId,
      OR: [{ endedAt: { isNull: true } }, { endedAt: { gte: left } }],
    },
    columns: { penId: true },
  });
  return [...new Set(rows.map((one) => one.penId))];
};

type PersonRow = NonNullable<Awaited<ReturnType<typeof resolvePerson>>>;

/** Who is acting, as the context names them: nothing for nobody. */
const personOf = (row: PersonRow | undefined) =>
  row
    ? {
        id: row.id,
        name: row.name,
        phone: row.phone,
        disabledAt: row.disabledAt,
      }
    : null;

/** Whether a person the Owner has disabled is shut out of this context: always, but for their own earlier work. */
const shutOut = (row: PersonRow, evenIfLeft: boolean) =>
  row.disabledAt !== null && !evenIfLeft;

/** The Pens they keep — or, left since, the Pens they kept until they went, which leaving ended. */
const pensOf = (db: Database, farmId: string, row: PersonRow) =>
  row.disabledAt
    ? pensKeptUntil(db, farmId, row.id, row.disabledAt)
    : Promise.resolve(row.penAssignments.map((p) => p.penId));

/** Whose request this is: the person signed in, whoever is switched in on the phone, or the person named. */
const actingUserOf = (
  session: Session | null,
  device: DeviceSession | null,
  personId: string | null
): string | null => session?.user.id ?? device?.activeUserId ?? personId;

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
  email = silentEmail,
  pushKey = null,
  farmId = null,
  callerAddress = null,
  callerAgent = null,
  evenIfLeft = false,
  personId = null,
}: {
  session: Session | null;
  device?: DeviceSession | null;
  deviceStatus?: DeviceStatus;
  callerAddress?: string | null;
  callerAgent?: string | null;
  clock: Clock;
  db: Database;
  push?: PushTransport;
  sms?: SmsTransport;
  email?: EmailTransport;
  pushKey?: string | null;
  /** Which Farm this request acts on, for a caller that knows. Nothing for a request on a farm's own install. */
  farmId?: string | null;
  /** Read a person the Owner has since disabled as they were until they left — their Roles, and the Pens they kept to
   *  the end — for work they did before it reaching the farm after (sync). Never for a request of their own. */
  evenIfLeft?: boolean;
  /** Somebody read with no request of their own: whose held work the Owner or the Manager takes into the records, done
   *  on their own phone. Read as on that phone — every Role they hold. */
  personId?: string | null;
}): Promise<Context> => {
  const base = {
    auth: null,
    session,
    clock,
    db,
    push,
    sms,
    email,
    pushKey,
    roleUsed: null,
    scope: { kind: "nothing" },
    deviceStatus,
    callerAddress,
    callerAgent,
  } as const;
  const actingUserId = actingUserOf(session, device, personId);
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
    rolesOffThePhone: [],
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
  const person = personOf(row);
  if (!row || shutOut(row, evenIfLeft)) {
    return { ...empty, farm, person };
  }
  const penIds = await pensOf(db, farm.id, row);

  const { roles, visiting, caseAnimalIds } = await accessOf(
    db,
    farm.id,
    row,
    clock.now()
  );

  return {
    ...base,
    device: deviceInfo,
    actor: { id: row.id, name: row.name },
    farm,
    person,
    ...asTheyWork({ roles, visiting, caseAnimalIds }, { device, session }),
    penIds,
  };
};

/** The caller's address as Better Auth's sign-in limit reads it: the first hop the proxy wrote down. The app is
 *  only ever reached through that proxy, which is what makes the header worth believing. */
const callerAddressOf = (req: Request): string | null =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

export const createContext = async ({
  req,
  clock = systemClock,
  db = productionDatabase(),
  push = defaultPush(),
  sms = defaultSms(),
  email = defaultEmail(),
  pushKey = env.VAPID_PUBLIC_KEY ?? null,
}: {
  req: Request;
  clock?: Clock;
  db?: Database;
  push?: PushTransport;
  sms?: SmsTransport;
  email?: EmailTransport;
  pushKey?: string | null;
}): Promise<Context> => {
  const callerAddress = callerAddressOf(req);
  // Cut short: it is the browser's own say, and a farm record is no place for an unbounded string anybody can send.
  const callerAgent = req.headers.get("user-agent")?.slice(0, 300) || null;
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
      // Carried, not dropped: a phone the Manager took off the farm's list is told so, rather than read as no phone.
      ...(resolved ? { deviceStatus: resolved.status } : {}),
      callerAddress,
      callerAgent,
      clock,
      db,
      push,
      sms,
      email,
      pushKey,
    });
  }
  return buildContext({
    session: await auth.api.getSession({ headers: req.headers }),
    callerAddress,
    callerAgent,
    clock,
    db,
    push,
    sms,
    email,
    pushKey,
  });
};
