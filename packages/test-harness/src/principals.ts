import { eq } from "@OpenFarm/db/operators";
import {
  session as sessionTable,
  user as userTable,
} from "@OpenFarm/db/schema/auth";
import { shedPhone, staffPin } from "@OpenFarm/db/schema/device";
import { farm as farmTable, roleAssignment } from "@OpenFarm/db/schema/farm";

import { DAY } from "./clock";
import { scratchDb } from "./database";

/** The four Roles the roles matrix names. */
export type Role = "owner" | "manager" | "staff" | "vet";
/** A Role, a signed-in person who holds none ("newcomer"), or a second person holding a
 *  Role somebody else already holds ("otherVet") — a farm has more than one Vet, and the
 *  clinical record is each Vet's own. */
export type Principal = Role | "newcomer" | "otherVet";

export const TEST_FARM = { id: "test-farm", name: "পরীক্ষা খামার" } as const;

const PEOPLE: Record<Principal, { id: string; name: string; email: string }> = {
  owner: { id: "test-owner", name: "মালিক", email: "owner@test.openfarm" },
  manager: {
    id: "test-manager",
    name: "ম্যানেজার",
    email: "manager@test.openfarm",
  },
  staff: { id: "test-staff", name: "রহিম", email: "staff@test.openfarm" },
  vet: { id: "test-vet", name: "ডা. করিম", email: "vet@test.openfarm" },
  newcomer: {
    id: "test-newcomer",
    name: "নতুন",
    email: "newcomer@test.openfarm",
  },
  otherVet: {
    id: "test-other-vet",
    name: "ডা. সালমা",
    email: "othervet@test.openfarm",
  },
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

/** Seeds the Farm (once), the person for a Principal (once), their Role on the Farm,
 *  and a session dated from `now` — all as real rows — and returns the persisted rows. */
export const createTestPrincipal = async (
  role: Principal,
  now: Date
): Promise<TestPrincipal> => {
  const db = scratchDb();
  const person = PEOPLE[role];

  await db
    .insert(farmTable)
    .values({ ...TEST_FARM, createdAt: now })
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
        farmId: TEST_FARM.id,
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
  // Parallel test files seed the same person at once; conflict on any unique index is
  // fine (the row exists), then refresh the expiry from this test's clock.
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

export const TEST_DEVICE = {
  id: "test-shed-phone",
  name: "শেড A ফোন",
} as const;

/** A Shed Phone enrolled on the test Farm, and a PIN for a Principal so they may PIN Switch
 *  on it. Returns the device session shape the API context expects. */
export const createTestDevice = async (
  role: Principal,
  now: Date,
  /** A phone of this test file's own. Sequence numbers belong to the phone that sent them,
   *  so two files sharing one phone take each other's place in its queue — and one file's
   *  batch then shows up as another's gap. Name your own and the queues stay separate. */
  phone: { id: string; name: string } = TEST_DEVICE
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
      farmId: TEST_FARM.id,
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
      farmId: TEST_FARM.id,
      salt: "dGVzdC1zYWx0LTE2Ynl0ZXM=",
      hash: "test-hash",
      setBy: principal.user.id,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return {
    ...phone,
    farmId: TEST_FARM.id,
    activeUserId: principal.user.id,
  };
};
