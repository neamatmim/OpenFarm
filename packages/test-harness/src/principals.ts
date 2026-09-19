import { eq } from "@OpenFarm/db/operators";
import {
  session as sessionTable,
  user as userTable,
} from "@OpenFarm/db/schema/auth";
import { shedPhone, staffPin } from "@OpenFarm/db/schema/device";
import {
  farm as farmTable,
  invite as inviteTable,
  roleAssignment,
} from "@OpenFarm/db/schema/farm";
import { expect } from "vitest";

import { DAY } from "./clock";
import { scratchDb } from "./database";

/** The four Roles the roles matrix names. */
export type Role = "owner" | "manager" | "staff" | "vet";
/** A Role, a signed-in person who holds none ("newcomer"), or a second person holding a
 *  Role somebody else already holds ("otherVet") — a farm has more than one Vet, and the
 *  clinical record is each Vet's own. */
export type Principal = Role | "newcomer" | "otherVet";

/**
 * The file vitest is running, as a name a Farm can be called after — its whole path below `src`, so two files of the
 * same name in different folders are two farms.
 *
 * Nothing to fall back on: a harness that cannot tell which file is asking would hand every file the same farm, which
 * is the thing this exists to stop, and it would do it silently.
 */
const thisFile = (): string => {
  const path = expect.getState().testPath;
  if (!path) {
    throw new Error(
      "test harness: vitest did not say which file is running, so this farm would be everybody's"
    );
  }
  return path
    .replace(/^.*\/src\//u, "")
    .replace(/\.test\.tsx?$/u, "")
    .replaceAll(/[^a-z0-9-]/giu, "-");
};

/**
 * The Farm this test file works on.
 *
 * One per file, not one per run. Everything a farm owns hangs off its id — its people, its Pens, its animals, the
 * watermark its sweep moves, the Shed Phones enrolled on it — so two files sharing one farm are two stories told over
 * one set of records: a sweep in one file makes another file's work late, and a person hired in one turns up in
 * another's list of who was told. Each file gets its own, named after itself, and the database is all they share.
 */
export const theFarm = (): { id: string; name: string } => {
  const file = thisFile();
  return { id: `farm-${file}`, name: `পরীক্ষা খামার (${file})` };
};

/** What each of the farm's people is called. Their names are the farm's; who they are is their own file's. */
const NAME_OF: Record<Principal, string> = {
  owner: "মালিক",
  manager: "ম্যানেজার",
  staff: "রহিম",
  vet: "ডা. করিম",
  newcomer: "নতুন",
  otherVet: "ডা. সালমা",
};

/**
 * One of this file's people: the Owner of its farm, its milker, its Vet.
 *
 * Their own, not the run's — a person holds their Roles on a Farm, and one person holding Roles on every test file's
 * Farm at once is a person no request could work out which farm to answer for.
 */
export const thePerson = (
  role: Principal
): { id: string; name: string; email: string } => {
  const file = thisFile();
  return {
    id: `${role}-${file}`,
    name: NAME_OF[role],
    email: `${role}.${file}@test.openfarm`,
  };
};

/**
 * An invite this farm is waiting on, so that an account may be opened against that address.
 *
 * The door only lets an account be made for somebody the farm asked for, which is how a real newcomer
 * arrives: invited first, then they open the account, then they take up the Roles with the code. A test
 * that signs somebody up without this is asking the farm to do something it refuses.
 *
 * The Owner must already exist — an invite says who wrote it.
 */
export const inviteWaitingFor = async (
  email: string,
  now: Date
): Promise<void> => {
  await scratchDb()
    .insert(inviteTable)
    .values({
      id: `invite-${email}`,
      farmId: theFarm().id,
      email: email.toLowerCase(),
      name: NAME_OF.newcomer,
      roles: ["staff"],
      status: "pending",
      invitedBy: thePerson("owner").id,
      invitedByRole: "owner",
      createdAt: now,
    })
    .onConflictDoNothing();
};

/** Which Role each Principal holds on the Farm. Null for the newcomer, who holds none. */
const ROLE_OF: Record<Principal, Role | null> = {
  owner: "owner",
  manager: "manager",
  staff: "staff",
  vet: "vet",
  otherVet: "vet",
  newcomer: null,
};

const SESSION_LIFETIME = 7 * DAY;

export interface TestPrincipal {
  role: Principal;
  user: typeof userTable.$inferSelect;
  session: typeof sessionTable.$inferSelect;
}

/** Seeds this file's Farm (once), the person for a Principal (once), their Role on that Farm,
 *  and a session dated from `now` — all as real rows — and returns the persisted rows. */
export const createTestPrincipal = async (
  role: Principal,
  now: Date
): Promise<TestPrincipal> => {
  const db = scratchDb();
  const person = thePerson(role);

  await db
    .insert(farmTable)
    .values({ ...theFarm(), createdAt: now })
    .onConflictDoNothing();

  const [inserted] = await db
    .insert(userTable)
    .values({ ...person, emailVerified: true, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning();
  const user =
    inserted ?? (await db.query.user.findFirst({ where: { id: person.id } }));
  if (!user) {
    throw new Error(`test harness: could not seed or find user ${person.id}`);
  }

  const held = ROLE_OF[role];
  if (held) {
    await db
      .insert(roleAssignment)
      .values({
        id: `role-${person.id}-${held}`,
        farmId: theFarm().id,
        userId: person.id,
        role: held,
        grantedBy: person.id,
        grantedByRole: held,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  const sessionValues = {
    id: `session-${person.id}`,
    token: `token-${person.id}`,
    userId: person.id,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  };
  // The same person seeded again by a later test in this file: a conflict on any unique index is fine (the row is
  // already there), and the expiry is refreshed from this test's clock.
  await db.insert(sessionTable).values(sessionValues).onConflictDoNothing();
  const [session] = await db
    .update(sessionTable)
    .set({ expiresAt: sessionValues.expiresAt, updatedAt: now })
    .where(eq(sessionTable.id, sessionValues.id))
    .returning();
  if (!session) {
    throw new Error(`test harness: could not seed session for ${person.id}`);
  }

  return { role, user, session };
};

/** This file's own Shed Phone. Sequence numbers belong to the phone that sent them, so a phone shared between files
 *  would have two queues in it and each would read as the other's gap. */
export const theShedPhone = (): { id: string; name: string } => ({
  id: `shed-phone-${thisFile()}`,
  name: "শেড A ফোন",
});

/** A Shed Phone enrolled on this file's Farm, and a PIN for a Principal so they may PIN Switch
 *  on it. Returns the device session shape the API context expects. */
export const createTestDevice = async (
  role: Principal,
  now: Date,
  /** A second phone, for a file whose story has two. Its own by default. */
  phone: { id: string; name: string } = theShedPhone()
): Promise<{
  id: string;
  name: string;
  farmId: string;
  activeUserId: string;
}> => {
  const db = scratchDb();
  const principal = await createTestPrincipal(role, now);

  await db
    .insert(shedPhone)
    .values({
      ...phone,
      farmId: theFarm().id,
      tokenHash: `test-token-${phone.id}`,
      enrolledBy: principal.user.id,
      claimedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(staffPin)
    .values({
      id: `pin-${principal.user.id}`,
      userId: principal.user.id,
      farmId: theFarm().id,
      salt: "dGVzdC1zYWx0LTE2Ynl0ZXM=",
      hash: "test-hash",
      setBy: principal.user.id,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return {
    ...phone,
    farmId: theFarm().id,
    activeUserId: principal.user.id,
  };
};
