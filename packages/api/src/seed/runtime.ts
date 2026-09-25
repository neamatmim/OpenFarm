import { auth } from "@OpenFarm/auth";
import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import type { Clock } from "../clock";
import type { Session } from "../context";
import { buildContext } from "../context";
import { appRouter } from "../routers";

const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** The one password every seeded account shares: these are accounts for looking around, not for keeping. */
export const SEED_PASSWORD = "OpenFarm@2026";

/** The farm's clock for the seed: set to a moment, and walked forward as the farm's days go by. */
export class SeedClock implements Clock {
  private at: Date;

  constructor(at: Date) {
    this.at = new Date(at);
  }

  now(): Date {
    return new Date(this.at);
  }

  set(at: Date): void {
    this.at = new Date(at);
  }
}

/** A moment on the farm's own clock (Asia/Dhaka, UTC+6): a farm day and a time of day. */
export const onFarm = (day: string, time = "09:00"): Date =>
  new Date(`${day}T${time}:00+06:00`);

/** The farm day `days` after `day`. */
export const addDays = (day: string, days: number): string =>
  new Date(onFarm(day, "12:00").getTime() + days * DAY)
    .toISOString()
    .slice(0, 10);

/** A small, repeatable source of chance: the same seed gives the same farm every time. */
export const randomFrom = (seed: number) => {
  // A linear congruential generator: plain arithmetic, repeatable, and plenty for choosing how much a cow gives.
  const MODULUS = 4_294_967_296;
  let state = seed % MODULUS;
  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % MODULUS;
    return state / MODULUS;
  };
  return {
    next,
    between: (low: number, high: number) => low + (high - low) * next(),
    int: (low: number, high: number) =>
      Math.floor(low + (high - low + 1) * next()),
    chance: (probability: number) => next() < probability,
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)] as T,
  };
};
export type Random = ReturnType<typeof randomFrom>;

export type ApiClient = RouterClient<typeof appRouter>;

export interface Account {
  role: string;
  name: string;
  email: string;
  session: Session;
}

/** Opens an account the way the sign-up form does, and keeps the session it signs in with. */
export const openAccount = async (
  db: Database,
  person: { role: string; name: string; email: string }
): Promise<Account> => {
  const { user } = await auth.api.signUpEmail({
    body: { name: person.name, email: person.email, password: SEED_PASSWORD },
  });
  const session = await db.query.session.findFirst({
    where: { userId: user.id },
  });
  const row = await db.query.user.findFirst({ where: { id: user.id } });
  if (!(session && row)) {
    throw new Error(`No session for ${person.email}`);
  }
  return { ...person, session: { user: row, session } as unknown as Session };
};

/** The API as this person reaches it, reading the farm's clock. Rebuilt whenever what they hold changes. */
export const clientOf = async (
  db: Database,
  account: Account,
  clock: Clock
): Promise<ApiClient> =>
  createRouterClient(appRouter, {
    context: await buildContext({ session: account.session, clock, db }),
  });

/** The API as somebody signed in to nothing reaches it: the portal's join page, before anybody has an account. */
export const nobodyClientOf = async (
  db: Database,
  clock: Clock
): Promise<ApiClient> =>
  createRouterClient(appRouter, {
    context: await buildContext({ session: null, clock, db }),
  });

/**
 * The API as an Investor reaches it from the portal, signed in on the farm's clock — so a sign-in that lasts a working
 * day is a day of the farm's, not of whoever runs the seed.
 */
export const portalClientOf = async (
  db: Database,
  loginEmail: string,
  clock: Clock
): Promise<ApiClient> => {
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error(`No account for ${loginEmail}`);
  }
  const start = clock.now();
  const id = uuidv7(start);
  await db.insert(sessionTable).values({
    id,
    token: `seed-${id}`,
    userId: person.id,
    expiresAt: new Date(start.getTime() + DAY),
    createdAt: start,
    updatedAt: start,
  });
  const session = await db.query.session.findFirst({ where: { id } });
  if (!session) {
    throw new Error(`No session for ${loginEmail}`);
  }
  return createRouterClient(appRouter, {
    context: await buildContext({
      session: { user: person, session } as unknown as Session,
      clock,
      db,
    }),
  });
};
