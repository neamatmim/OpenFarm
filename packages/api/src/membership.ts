import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { session as sessionTable, user } from "@OpenFarm/db/schema/auth";
import { staffPin } from "@OpenFarm/db/schema/device";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE, invite, roleAssignment } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ASSIGNMENT, penAssignment } from "@OpenFarm/db/schema/herd";
import {
  derivePinHash,
  isPin,
  randomPinSalt,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { hashToken } from "./device";

/** As much of the farm's records as a reader needs — inside a transaction, or out of one, because what
 *  somebody holds is as often a question the screen asks as one a rule does. */
type Reading = Pick<Tx, "query">;

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

/** Who is making the change, and in which Role they are making it. Either may be missing, because the farm
 *  itself grants Roles at times — a Vet taking up an invitation the Owner approved holds them from the Owner. */
export interface By {
  id: string | null;
  role: RoleName | null;
}

/** A person acting in a Role, both known: an invitation is always written and approved by somebody. */
export interface Acting {
  id: string;
  role: RoleName;
}

/** The Roles a person holds today. */
export const rolesOf = async (
  tx: Reading,
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
export const standingOf = async (tx: Reading, userId: string) => {
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

/** The Pens a Staff member keeps today, in an order two readings can be compared in. */
export const pensOf = async (
  tx: Reading,
  farmId: string,
  userId: string
): Promise<string[]> => {
  const rows = await tx.query.penAssignment.findMany({
    where: { farmId, userId, ...ACTIVE_ASSIGNMENT },
    columns: { penId: true },
  });
  return rows.map((row) => row.penId).toSorted();
};

/**
 * Hands somebody Pens and takes Pens back.
 *
 * A Pen handed back reopens the assignment they had before rather than starting a second one, so that what a
 * Staff member keeps reads as one history of this farm's Pens and not as a pile of overlapping ones. A Pen
 * this farm does not have is refused before anything moves.
 */
export const setPens = async (
  tx: Tx,
  farmId: string,
  userId: string,
  { add, remove }: { add: readonly string[]; remove: readonly string[] },
  now: Date
): Promise<void> => {
  const named = [...new Set([...add, ...remove])];
  const pens = named.length
    ? await tx.query.pen.findMany({
        where: { farmId, id: { in: named } },
        columns: { id: true },
      })
    : [];
  if (pens.length !== named.length) {
    throw new ORPCError("NOT_FOUND", { message: "No such Pen on this farm" });
  }
  const person = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { id: true },
  });
  if (!person) {
    throw new ORPCError("NOT_FOUND", {
      message: "Nobody on this farm by that name",
    });
  }
  const held = new Set(await pensOf(tx, farmId, userId));
  const adding = [...new Set(add)].filter((penId) => !held.has(penId));
  if (adding.length > 0) {
    await tx
      .insert(penAssignment)
      .values(
        adding.map((penId) => ({
          id: uuidv7(now),
          farmId,
          userId,
          penId,
          createdAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [penAssignment.userId, penAssignment.penId],
        set: { endedAt: null },
      });
  }
  if (remove.length > 0) {
    await tx
      .update(penAssignment)
      .set({ endedAt: now })
      .where(
        and(
          eq(penAssignment.farmId, farmId),
          eq(penAssignment.userId, userId),
          inArray(penAssignment.penId, [...remove]),
          isNull(penAssignment.endedAt)
        )
      );
  }
};

/** What the farm keeps of a PIN: a salt and a hash derived from it, never the PIN.
 *
 *  Worked out before the transaction opens, because deriving a hash is deliberately slow and a transaction
 *  held open while it runs is a lock held for no reason (ADR 0003). */
export const newPin = async (
  pin: string
): Promise<{ salt: string; hash: string }> => {
  if (!isPin(pin)) {
    throw new ORPCError("BAD_REQUEST", { message: "A PIN is four digits" });
  }
  const salt = randomPinSalt();
  return { salt, hash: await derivePinHash(pin, salt) };
};

/**
 * Gives somebody the PIN they switch in with on a Shed Phone, or rotates the one they had.
 *
 * A Manager may only do this for Barn Staff: a PIN is how a person acts on a shared phone, so a Manager
 * setting an Owner's PIN would route around the rule that only the Owner grants Roles above Staff.
 */
export const setPin = async (
  tx: Tx,
  farmId: string,
  userId: string,
  credential: { salt: string; hash: string },
  by: By,
  now: Date
): Promise<void> => {
  const person = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { id: true },
    with: { roles: { where: { farmId, ...ACTIVE_ROLE } } },
  });
  if (!person || person.roles.length === 0) {
    throw new ORPCError("NOT_FOUND", {
      message: "That person is not on this farm",
    });
  }
  const staffOnly = person.roles.every((role) => role.role === "staff");
  if (by.role === "manager" && !staffOnly) {
    throw new ORPCError("FORBIDDEN", {
      message: "A Manager may only set a PIN for Barn Staff",
    });
  }
  const set = {
    ...credential,
    setBy: by.id,
    setByRole: by.role,
    updatedAt: now,
  };
  await tx
    .insert(staffPin)
    .values({ id: uuidv7(now), userId, farmId, ...set })
    .onConflictDoUpdate({
      target: [staffPin.userId, staffPin.farmId],
      set,
    });
};

/** Letters and digits nobody misreads when a code is read out across a shed: no 0/O, no 1/I. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const A_DAY = 24 * 60 * 60 * 1000;

/** A fresh invitation code, and what the farm keeps of it. The code is shown once, to whoever invited them,
 *  to hand over in person; the farm keeps only the hash, so a code is never read back out of it. */
export const newInviteCode = async (): Promise<{
  code: string;
  codeHash: string;
}> => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const code = Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]
  ).join("");
  return { code, codeHash: await hashToken(code) };
};

/** The instant a visit's access ends: the close of its last farm day. A visit ending before today is no visit. */
const endOfVisit = (day: string, now: Date): Date => {
  const end = new Date(startOfFarmDay(day).getTime() + A_DAY);
  if (end <= now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A visit has to last until today at least",
    });
  }
  return end;
};

/** An invitation as it will stand once it is written. */
export interface PlannedInvite {
  id: string;
  status: "pending" | "approved";
  /** Shown once to whoever invited them; never stored. */
  code: string;
  codeHash: string;
  email: string;
  name: string;
  roles: RoleName[];
  /** The last farm day a visiting Vet's access lasts, and the instant it ends. */
  visitUntil: string | null;
  accessUntil: Date | null;
}

/**
 * An invitation worked out before anything is written: who it is for, what it grants, whether it stands
 * approved already, and the code to hand over.
 *
 * The Owner invites anybody and their invitation is approved as they make it. A Manager invites Barn Staff and
 * calls in a visiting Vet, and the Owner approves either — so a Manager cannot make a second Owner, or a Vet
 * who stays, by writing an invitation for one (roles matrix).
 */
export const planInvite = async (
  asked: {
    email: string;
    name: string;
    roles: readonly RoleName[];
    visitUntil?: string;
  },
  by: Acting,
  now: Date
): Promise<PlannedInvite> => {
  const visiting = asked.visitUntil !== undefined;
  if (visiting && !(asked.roles.length === 1 && asked.roles[0] === "vet")) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a Vet is invited for a visit",
    });
  }
  const managerMay = asked.roles.every((role) => role === "staff") || visiting;
  if (by.role === "manager" && !managerMay) {
    throw new ORPCError("FORBIDDEN", {
      message: "A Manager may only invite Staff or a visiting Vet",
    });
  }
  return {
    id: uuidv7(now),
    status: by.role === "owner" ? "approved" : "pending",
    ...(await newInviteCode()),
    email: asked.email,
    name: asked.name,
    roles: [...asked.roles],
    visitUntil: asked.visitUntil ?? null,
    accessUntil: visiting ? endOfVisit(asked.visitUntil ?? "", now) : null,
  };
};

/** Writes a planned invitation down. */
export const writeInvite = async (
  tx: Tx,
  farmId: string,
  planned: PlannedInvite,
  by: Acting,
  now: Date
): Promise<void> => {
  const approved = planned.status === "approved";
  await tx.insert(invite).values({
    id: planned.id,
    farmId,
    email: planned.email,
    name: planned.name,
    roles: planned.roles,
    status: planned.status,
    invitedBy: by.id,
    invitedByRole: by.role,
    approvedBy: approved ? by.id : null,
    approvedAt: approved ? now : null,
    codeHash: planned.codeHash,
    vetScope: planned.accessUntil ? "visiting" : null,
    accessUntil: planned.accessUntil,
    createdAt: now,
  });
};

/** A new code for an invitation not yet taken up — the first one lost, or never written down. The old code
 *  stops working at once, because the row holds one hash and this replaces it. */
export const reissueInvite = async (
  tx: Tx,
  farmId: string,
  id: string,
  codeHash: string
): Promise<void> => {
  const [row] = await tx
    .update(invite)
    .set({ codeHash })
    .where(
      and(
        eq(invite.id, id),
        eq(invite.farmId, farmId),
        isNull(invite.acceptedAt)
      )
    )
    .returning({ id: invite.id });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "No invite waiting to be taken up",
    });
  }
};

/**
 * Taking up an invitation: the person signed in with the email they were invited under hands over the code,
 * and holds the Roles it was written for.
 *
 * The code works once, only once the Owner has approved the invitation, and only for that email — so somebody
 * who signs up first with another person's address gets nothing. Nothing comes back when the code is not one
 * this farm is waiting for, which is a wrong guess for the caller to count.
 */
export const acceptInvite = async (
  tx: Tx,
  farmId: string,
  taker: { userId: string; email: string; codeHash: string },
  now: Date
): Promise<RoleName[] | null> => {
  const [row] = await tx
    .update(invite)
    .set({ codeHash: null, acceptedAt: now })
    .where(
      and(
        eq(invite.farmId, farmId),
        eq(invite.codeHash, taker.codeHash),
        eq(invite.email, taker.email),
        eq(invite.status, "approved"),
        isNull(invite.acceptedAt)
      )
    )
    .returning({
      roles: invite.roles,
      approvedBy: invite.approvedBy,
      accessUntil: invite.accessUntil,
    });
  if (!row) {
    return null;
  }
  const roles = [...row.roles];
  await grantRoles(
    tx,
    farmId,
    taker.userId,
    roles,
    { id: row.approvedBy ?? taker.userId, role: "owner" },
    now,
    { reactivate: true, visitUntil: row.accessUntil ?? undefined }
  );
  return roles;
};

/** The Owner approving an invitation a Manager wrote. Only a pending one of this Farm flips, so a second
 *  approver is told there is nothing to approve rather than approving it again. */
export const approveInvite = async (
  tx: Tx,
  farmId: string,
  id: string,
  by: Acting,
  now: Date
): Promise<void> => {
  const [row] = await tx
    .update(invite)
    .set({ status: "approved", approvedBy: by.id, approvedAt: now })
    .where(
      and(
        eq(invite.id, id),
        eq(invite.farmId, farmId),
        eq(invite.status, "pending")
      )
    )
    .returning({ id: invite.id });
  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }
};
