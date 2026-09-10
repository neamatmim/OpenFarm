import { eq } from "@OpenFarm/db/operators";
import {
  session as sessionTable,
  user as userTable,
} from "@OpenFarm/db/schema/auth";
import { farm as farmTable, roleAssignment } from "@OpenFarm/db/schema/farm";

import { DAY } from "./clock";
import { scratchDb } from "./database";

/** The four Roles the roles matrix names. */
export type Role = "owner" | "manager" | "staff" | "vet";
/** A Role, or a signed-in person who holds none ("newcomer"). */
export type Principal = Role | "newcomer";

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

  if (role !== "newcomer") {
    await db
      .insert(roleAssignment)
      .values({
        id: `role-${person.id}-${role}`,
        farmId: TEST_FARM.id,
        userId: person.id,
        role,
        grantedBy: person.id,
        grantedByRole: role,
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
