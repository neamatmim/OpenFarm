import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { sharedDatabase } from "@OpenFarm/db";
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
    /** How many days before a Lot's last day the store is warned. */
    expiryWarnDays: number;
    /** What a bought-in fattening animal is fed towards unless the Manager says otherwise. */
    fatteningTargetWeightKg: number;
    /** How many days back a fattening animal's gain is read against her Ration's Expected Gain. */
    gainReadDays: number;
    /** The shares of a Ration's Expected Gain a deshi animal and a cow or heifer are judged against, as percentages. */
    deshiGainPercent: number;
    femaleGainPercent: number;
    /** Under what share of her penmates' middle gain a fattening animal is pointed out as slow, as a percentage. */
    penGainPercent: number;
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
    /** How many days back an animal's keep is read, for keep-or-sell and the culling list. */
    keepReadDays: number;
    /** How many days ahead keeping a fattening animal is weighed, for keep-or-sell. */
    keepAheadDays: number;
    /** How many days an animal must have been here before her keep is judged. */
    keepNeedsDays: number;
    /** How many days apart her last two Weigh-ins must be before their gain is trusted for keep-or-sell. */
    keepRateGapDays: number;
    /** How many days after calving a cow still not in calf is named to the Owner for culling. */
    cullOpenDays: number;
    /** How many days into her Lactation before a cow's milk is weighed against her keep for culling. */
    cullMilkAfterDays: number;
    /** How many days after calving a cow's milk is her calf's. */
    cullCalfMilkDays: number;
    /** How many days back the Dispatches are read for what a litre of the farm's milk fetches. */
    cullMilkPriceDays: number;
    /** The fewest days money must have been tied up, on average, before a return is put a year. */
    returnYearFloorDays: number;
    /** The taka above which a Money Event waits for the Owner. */
    approvalThresholdMoney: number;
    /** The day of the month from which a Monthly Cost with nothing entered that month is named. */
    monthlyCostsFromDay: number;
    /** How many days a Receivable with no promised day may run before it is overdue. */
    receivableDays: number;
    /** The taka a Stock Count may come up short by before the Owner and the Manager are told of it. */
    storeShortfallTellMoney: number;
    /** How many animals in one Pen seen with sores, within how many hours, before the farm is told at once. */
    soresTellAnimals: number;
    soresTellHours: number;
    /** How many Diagnoses within how many days put an animal on the Manager's list as ill again and again. */
    illAgainDiagnoses: number;
    illAgainDays: number;
    /** The day after calving from which an open cow with no heat seen is on the heat watch. */
    heatWatchAfterCalvingDays: number;
    /** The age a heifer should have been served by, crossbred and deshi. */
    firstServiceMonths: number;
    deshiFirstServiceMonths: number;
    /** How far under her own week a cow's milk must fall, over how many days, before she is named as giving less. */
    milkDropPercent: number;
    milkDropDays: number;
    /** How much of a week's milk may go unaccounted for before the Owner and the Manager are told. */
    milkUnaccountedPercent: number;
    /** How many days an animal may be Missing before the Owner is asked whether to write her off as Lost. */
    missingWriteOffDays: number;
    /** How far a Feed Purchase's price per unit may rise on the last one before the Owner is told. */
    feedPriceJumpPercent: number;
    /** How far under her arrival weight a bought animal's first Weigh-in may come before the Owner is told. */
    arrivalShortPercent: number;
    /** What the farm allows Shrink to take off a bull before the Owner is told, and what a Sale's floor allows for. */
    shrinkTellPercent: number;
    /** How many days of a feed left, at the rate it is fed, before it is Running Low. */
    feedDaysLow: number;
    /** How many days after a Release or an arrival dose is put off it is raised again. */
    putOffDays: number;
    /** How far a Cash Count may come up short before the Owner is told. */
    cashShortTellMoney: number;
    /** How far a monthly medicine count may come up short, in taka, before the Owner is told. */
    medicineShortTellMoney: number;
    /** What part of a Venture's target capital is the least worth starting on. */
    ventureFloorPercent: number;
    /** What part of a Venture's capital keeps the animals rather than buying them. */
    ventureRunningPercent: number;
    /** Where a new Investment Agreement's split starts. A default, never a rule. */
    ventureInvestorsPercent: number;
    /** The days a Venture keeps selling after its window before the Farm buys the rest. */
    windUpDays: number;
    /** How old her last Weigh-in may be for an Internal Sale or the buy-back to price her on. */
    priceWeighInDays: number;
    /** The taka above which a Settlement Adjustment has to be paid or waived rather than only noted. */
    adjustmentThresholdMoney: number;
    /** How many Investors the Farm may have at a time, and where it starts warning. */
    investorCap: number;
    investorWarnAt: number;
    /** How little may be left to keep a Venture's animals with before the farm says so, in taka. */
    runningBudgetWarnMoney: number;
    /** Whether invited Investors may sign in to the portal (ADR 0007). */
    investorPortal: boolean;
    /** Whether invited Investors are shown each Venture's Projection (ADR 0010). */
    investorProjections: boolean;
    /** Whether invited Investors are shown a settled Venture's Return on Capital (ADR 0012). */
    investorReturns: boolean;
    /** Whether Agreements and Amendments may be agreed within the app, instead of on stamped paper. */
    agreementsInApp: boolean;
    /** Whether an Investor may send a Pay-in Note from the portal (ADR 0018). */
    payInNotes: boolean;
    /** The market price a kilo of live weight, low and high, as the Owner last judged it; nothing until set. */
    marketLowMoneyPerKg: number | null;
    marketHighMoneyPerKg: number | null;
    marketPriceSetAt: Date | null;
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
    /** The last farm day whose scheduled work was raised (`theDaysWork`). */
    workRaisedOn: string | null;
  } | null;
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
  callerAddress = null,
}: {
  session: Session | null;
  device?: DeviceSession | null;
  deviceStatus?: DeviceStatus;
  callerAddress?: string | null;
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
    callerAddress,
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
    penIds: row.penAssignments.map((p) => p.penId),
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
  pushKey = env.VAPID_PUBLIC_KEY ?? null,
}: {
  req: Request;
  clock?: Clock;
  db?: Database;
  push?: PushTransport;
  sms?: SmsTransport;
  pushKey?: string | null;
}): Promise<Context> => {
  const callerAddress = callerAddressOf(req);
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
      clock,
      db,
      push,
      sms,
      pushKey,
    });
  }
  return buildContext({
    session: await auth.api.getSession({ headers: req.headers }),
    callerAddress,
    clock,
    db,
    push,
    sms,
    pushKey,
  });
};
