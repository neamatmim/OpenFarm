import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { session as sessionTable, user } from "@OpenFarm/db/schema/auth";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE, roleAssignment } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

/**
 * Who works here.
 *
 * A person's Membership is the Roles they hold, whether they still work here, the Pens they keep and the PIN
 * they switch in with — and the rules the farm insists on about all four: that it is never left without an
 * Owner, that nobody takes their own access away, that a Pen handed back is the assignment they had before
 * rather than a second one.
 *
 * Everything here works inside one transaction and writes no Audit Event: who is asking, in which Role and
 * from which device is what a request knows, so the trail is written by whoever called (CONTEXT: Audit Event).
 */

/** Who is making the change, and in which Role they are making it. */
export interface By {
  id: string | null;
  role: RoleName | null;
}

/** The Roles a person holds today. */
export const rolesOf = async (
  tx: Tx,
  farmId: string,
  userId: string
): Promise<RoleName[]> => {
  const rows = await tx.query.roleAssignment.findMany({
    where: { farmId, userId, ...ACTIVE_ROLE },
    columns: { role: true },
  });
  return rows.map((row) => row.role);
};

/** Whether somebody still works here, and what the farm calls them — what the trail records either side of a
 *  change. Nothing for somebody the farm has never heard of. */
export const standingOf = async (tx: Tx, userId: string) => {
  const row = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { name: true, disabledAt: true },
  });
  return row ? { name: row.name, disabledAt: row.disabledAt } : null;
};

/** Grants Roles. A previously revoked Role is re-activated only when `reactivate` is set —
 *  an Owner's explicit assignment, never an automatic grant. Held Roles are left untouched. */
export const grantRoles = async (
  tx: Tx,
  farmId: string,
  userId: string,
  roles: readonly RoleName[],
  granter: By,
  now: Date,
  {
    reactivate = false,
    visitUntil,
  }: {
    reactivate?: boolean;
    /** A Vet granted for a visit: sees only their Cases, and only until then. */
    visitUntil?: Date;
  } = {}
): Promise<void> => {
  const visit = visitUntil
    ? { scope: "visiting" as const, expiresAt: visitUntil }
    : { scope: null, expiresAt: null };
  const held = await rolesOf(tx, farmId, userId);
  const missing = roles.filter((role) => !held.includes(role));
  if (missing.length === 0) {
    return;
  }
  const insert = tx.insert(roleAssignment).values(
    missing.map((role) => ({
      id: uuidv7(now),
      farmId,
      userId,
      role,
      grantedBy: granter.id,
      grantedByRole: granter.role,
      createdAt: now,
      ...(role === "vet" ? visit : {}),
    }))
  );
  await (reactivate
    ? insert.onConflictDoUpdate({
        target: [
          roleAssignment.farmId,
          roleAssignment.userId,
          roleAssignment.role,
        ],
        set: {
          revokedAt: null,
          grantedBy: granter.id,
          grantedByRole: granter.role,
          ...visit,
        },
      })
    : insert.onConflictDoNothing());
};

/** Revokes exactly these Roles; rows and their attribution stay. */
const revokeRoles = async (
  tx: Tx,
  farmId: string,
  userId: string,
  roles: readonly RoleName[],
  now: Date
): Promise<void> => {
  if (roles.length === 0) {
    return;
  }
  await tx
    .update(roleAssignment)
    .set({ revokedAt: now })
    .where(
      and(
        eq(roleAssignment.farmId, farmId),
        eq(roleAssignment.userId, userId),
        inArray(roleAssignment.role, [...roles]),
        isNull(roleAssignment.revokedAt)
      )
    );
};

/** Somebody else who still holds the Owner's Role. */
const anotherOwner = async (tx: Tx, farmId: string, besides: string) => {
  const owners = await tx.query.roleAssignment.findMany({
    where: { farmId, role: "owner", ...ACTIVE_ROLE },
    columns: { userId: true },
  });
  return owners.some((one) => one.userId !== besides);
};

/**
 * Makes the Roles somebody holds exactly the ones wanted.
 *
 * A farm with nobody who can see and approve everything is a farm that cannot be run, so the last Owner keeps
 * the Role — and an Owner does not take it off themselves even when another one stands, because the farm
 * should not be one mistaken tap from having nobody.
 */
export const setRoles = async (
  tx: Tx,
  farmId: string,
  userId: string,
  wanted: readonly RoleName[],
  by: By,
  now: Date
): Promise<void> => {
  const held = await rolesOf(tx, farmId, userId);
  const losingOwner = held.includes("owner") && !wanted.includes("owner");
  if (
    losingOwner &&
    (userId === by.id || !(await anotherOwner(tx, farmId, userId)))
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The farm must keep at least one other Owner",
    });
  }
  await revokeRoles(
    tx,
    farmId,
    userId,
    held.filter((role) => !wanted.includes(role)),
    now
  );
  await grantRoles(tx, farmId, userId, wanted, by, now, { reactivate: true });
};

/**
 * Whether somebody still works here.
 *
 * Disabling signs them out everywhere — their sessions are expired rather than deleted, so the record of them
 * stays — and touches nothing else they ever recorded. Nobody disables themselves: the farm is not somewhere a
 * person can shut themselves out of by accident.
 */
export const setStanding = async (
  tx: Tx,
  userId: string,
  { disabled, by, now }: { disabled: boolean; by: By; now: Date }
): Promise<void> => {
  if (disabled && userId === by.id) {
    throw new ORPCError("BAD_REQUEST", {
      message: "You cannot disable yourself",
    });
  }
  const [row] = await tx
    .update(user)
    .set({ disabledAt: disabled ? now : null })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }
  if (disabled) {
    await tx
      .update(sessionTable)
      .set({ expiresAt: now, updatedAt: now })
      .where(eq(sessionTable.userId, userId));
  }
};
