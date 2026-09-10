import {
  session as sessionTable,
  user as userTable,
} from "@OpenFarm/db/schema/auth";

import { DAY } from "./clock";
import { scratchDb } from "./database";

/** The four Roles the roles matrix names. Permissions arrive with a later ticket;
 *  here a Role selects a deterministic seeded person. */
export type Role = "owner" | "manager" | "staff" | "vet";

const PEOPLE: Record<Role, { id: string; name: string; email: string }> = {
  owner: { id: "test-owner", name: "মালিক", email: "owner@test.openfarm" },
  manager: {
    id: "test-manager",
    name: "ম্যানেজার",
    email: "manager@test.openfarm",
  },
  staff: { id: "test-staff", name: "রহিম", email: "staff@test.openfarm" },
  vet: { id: "test-vet", name: "ডা. করিম", email: "vet@test.openfarm" },
};

const SESSION_LIFETIME = 7 * DAY;

export interface TestPrincipal {
  role: Role;
  user: typeof userTable.$inferSelect;
  session: typeof sessionTable.$inferSelect;
}

/** Seeds the person for a Role (once per run) and a session for them dated from `now`,
 *  both as real rows in the scratch database, and returns the persisted rows. */
export const createTestPrincipal = async (
  role: Role,
  now: Date
): Promise<TestPrincipal> => {
  const db = scratchDb();
  const person = PEOPLE[role];

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
  const [session] = await db
    .insert(sessionTable)
    .values(sessionValues)
    .onConflictDoUpdate({
      target: sessionTable.id,
      set: { expiresAt: sessionValues.expiresAt, updatedAt: now },
    })
    .returning();
  if (!session) {
    throw new Error(`test harness: could not seed session for ${person.id}`);
  }

  return { role, user, session };
};
