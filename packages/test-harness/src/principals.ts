import { user as userTable } from "@OpenFarm/db/schema/auth";

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

export interface TestPrincipal {
  role: Role;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  };
}

/** Seeds (idempotently) the person for a Role in the scratch database and returns
 *  a session for them, shaped like Better Auth's, dated from `now`. */
export const createTestPrincipal = async (
  role: Role,
  now: Date
): Promise<TestPrincipal> => {
  const person = PEOPLE[role];
  await scratchDb()
    .insert(userTable)
    .values({ ...person, emailVerified: true, createdAt: now, updatedAt: now })
    .onConflictDoNothing();

  return {
    role,
    user: {
      ...person,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: `session-${person.id}`,
      token: `token-${person.id}`,
      userId: person.id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  };
};
