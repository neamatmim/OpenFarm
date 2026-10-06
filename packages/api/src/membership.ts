/**
 * Who works here.
 *
 * A person's Membership is the Roles they hold, whether they still work here, the Pens they keep and the PIN
 * they switch in with — and the rules the farm insists on about all four: that it is never left without an
 * Owner, that nobody ends their own Membership, that a Pen handed back is the assignment they had before
 * rather than a second one.
 *
 * Everything here works inside one transaction and writes no Audit Event: who is asking, in which Role and
 * from which device is what a request knows, so the trail is written by whoever called (CONTEXT: Audit Event).
 */

import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, gt, inArray, isNull, sql } from "@OpenFarm/db/operators";
import { session as sessionTable, user } from "@OpenFarm/db/schema/auth";
import { deviceSwitch, staffPin } from "@OpenFarm/db/schema/device";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import {
  INVITE_LAPSE_DAYS,
  ACTIVE_ROLE,
  invite,
  passwordCode,
  roleAssignment,
} from "@OpenFarm/db/schema/farm";
import { ACTIVE_ASSIGNMENT, penAssignment } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { pushSubscription } from "@OpenFarm/db/schema/push";
import {
  OPEN_INSTANCE_STATES,
  aManagerMayInvite,
  derivePinHash,
  isPin,
  isTooEasyPin,
  randomPinSalt,
  shedPhoneOnlyAddressOf,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { hashToken } from "./device";

/** As much of the farm's records as a reader needs — inside a transaction, or out of one, because what
 *  somebody holds is as often a question the screen asks as one a rule does. */
type Reading = Pick<Tx, "query">;

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

/**
 * Whether this caller may reach into somebody's way in — their PIN, a password code, where they are signed in.
 * The Owner may for anybody on the farm; a Manager only for Barn Staff, because each of these is a way to act as
 * the person or to turn them out, and a Manager who could do it to the Owner could approve his own spending.
 * One rule for all four, so no one of them is loosened without the others.
 */
export const accessIsTheirsToGive = async (
  tx: Reading,
  farmId: string,
  userId: string,
  by: { role: RoleName | null },
  refused: string
): Promise<void> => {
  const held = await rolesOf(tx, farmId, userId);
  if (held.length === 0) {
    throw new ORPCError("NOT_FOUND", {
      message: "That person is not on this farm",
      data: { refusal: "not_on_this_farm" },
    });
  }
  const staffOnly = held.every((role) => role === "staff");
  if (by.role === "manager" && !staffOnly) {
    throw new ORPCError("FORBIDDEN", {
      message: refused,
      data: { refusal: "manager_staff_only" },
    });
  }
};

/** What the farm calls somebody and whether they still work here — what the trail records either side of a
 *  change. Nothing for somebody the farm has never heard of.
 *
 *  No Farm is named, here or below: a person is a row of the whole database, and this farm is the only one
 *  there is (CONTEXT: Farm). What is this Farm's is the Roles they hold on it. */
export const whoTheyAre = async (tx: Reading, userId: string) => {
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
  by: Acting,
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
      data: { refusal: "keep_another_owner" },
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

/** Whether somebody still works here, written down. */
const markDisabled = async (
  tx: Tx,
  userId: string,
  disabledAt: Date | null
): Promise<void> => {
  const [row] = await tx
    .update(user)
    .set({ disabledAt })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }
};

/**
 * The Owner ending somebody's Membership: they are signed out everywhere and record nothing more.
 *
 * Their sessions are expired rather than deleted, so the record of them stays, and everything they ever wrote
 * is left exactly where it is. Nobody ends their own: the farm is not somewhere a person can shut themselves
 * out of by accident.
 */
export const endMembership = async (
  tx: Tx,
  userId: string,
  { by, now, farmId }: { by: Acting; now: Date; farmId: string }
): Promise<void> => {
  if (userId === by.id) {
    throw new ORPCError("BAD_REQUEST", {
      message: "You cannot disable yourself",
      data: { refusal: "cannot_disable_yourself" },
    });
  }
  await markDisabled(tx, userId, now);
  await tx
    .update(sessionTable)
    .set({ expiresAt: now, updatedAt: now })
    .where(eq(sessionTable.userId, userId));
  // What was theirs to do goes back to everyone (the Owner, 2026-10-07): work pinned to them or in their hands, which
  // nobody else could touch while it stayed theirs, and the Pens they kept, whose notices would go on reaching them.
  // Their Roles stay, to be given back; these do not come back with them.
  const stillOwed = [...OPEN_INSTANCE_STATES];
  await tx
    .update(sopInstance)
    .set({ assignedTo: null })
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        eq(sopInstance.assignedTo, userId),
        inArray(sopInstance.state, stillOwed)
      )
    );
  await tx
    .update(sopInstance)
    .set({ claimedBy: null, claimedAt: null })
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        eq(sopInstance.claimedBy, userId),
        inArray(sopInstance.state, stillOwed)
      )
    );
  await tx
    .update(penAssignment)
    .set({ endedAt: now })
    .where(
      and(
        eq(penAssignment.farmId, farmId),
        eq(penAssignment.userId, userId),
        isNull(penAssignment.endedAt)
      )
    );
};

/** Somebody back at work: they sign in again, and the Roles they held are the Roles they held. */
export const restoreMembership = (tx: Tx, userId: string): Promise<void> =>
  markDisabled(tx, userId, null);

/** One place somebody is signed in: a browser or a phone of their own, holding a session of theirs.
 *
 *  Not a Shed Phone, which is the farm's own handset holding a device session that people PIN Switch on
 *  (CONTEXT: Shed Phone). This is where a person is signed in as themselves. */
export interface SignedInOn {
  id: string;
  since: Date;
  lastSeen: Date;
  from: string | null;
  browser: string | null;
}

/** Where somebody is signed in today, the most recently used first. An expired session is not somewhere they
 *  are: it is somewhere they were, and there is nothing to sign out of. */
export const signedInOn = async (
  tx: Reading,
  userId: string,
  now: Date
): Promise<SignedInOn[]> => {
  const rows = await tx.query.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    columns: {
      id: true,
      createdAt: true,
      updatedAt: true,
      ipAddress: true,
      userAgent: true,
    },
    orderBy: { updatedAt: "desc", id: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    since: row.createdAt,
    lastSeen: row.updatedAt,
    from: row.ipAddress,
    browser: row.userAgent,
  }));
};

/**
 * Signs somebody out of one of the places they are signed in — a phone left in the yard, a browser in a shop.
 *
 * Expired rather than deleted, as ending a Membership does it: the record that they were signed in there stays.
 * Only a session of theirs: signing one person out of another's is not something to be one mistyped id away
 * from.
 */
export const signOutOf = async (
  tx: Tx,
  userId: string,
  sessionId: string,
  now: Date
): Promise<void> => {
  const [row] = await tx
    .update(sessionTable)
    .set({ expiresAt: now, updatedAt: now })
    .where(
      and(
        eq(sessionTable.id, sessionId),
        eq(sessionTable.userId, userId),
        gt(sessionTable.expiresAt, now)
      )
    )
    .returning({ id: sessionTable.id });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "They are not signed in there",
      data: { refusal: "not_signed_in_there" },
    });
  }
  // And that phone stops being told: a phone left in a yard, signed out, must not go on showing the farm's notices on
  // its lock screen.
  await tx
    .update(pushSubscription)
    .set({ revokedAt: now })
    .where(
      and(
        eq(pushSubscription.sessionId, sessionId),
        isNull(pushSubscription.revokedAt)
      )
    );
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
    throw new ORPCError("BAD_REQUEST", {
      message: "A PIN is four digits",
      data: { refusal: "pin_four_digits" },
    });
  }
  if (isTooEasyPin(pin)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That PIN is one anybody would try first",
      data: { refusal: "pin_too_easy" },
    });
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
  by: Acting,
  now: Date
): Promise<void> => {
  await accessIsTheirsToGive(
    tx,
    farmId,
    userId,
    by,
    "A Manager may only set a PIN for Barn Staff"
  );
  // A PIN opens a Shed Phone, and a Shed Phone holds Barn Staff alone: anybody else's PIN would only put their hash on
  // the barn's phone (the Owner's decision of 2026-10-04).
  const held = await rolesOf(tx, farmId, userId);
  if (!held.includes("staff")) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A PIN is for Barn Staff, who work on the Shed Phone",
      data: { refusal: "pin_is_for_staff" },
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
  // A new PIN is set because the old one is known to somebody: whoever is switched in with it is switched out, on every
  // one of this farm's phones, and must PIN in again with the new one.
  const phones = await tx.query.shedPhone.findMany({
    where: { farmId },
    columns: { id: true },
  });
  if (phones.length > 0) {
    await tx
      .update(deviceSwitch)
      .set({ expiresAt: now })
      .where(
        and(
          eq(deviceSwitch.userId, userId),
          inArray(
            deviceSwitch.deviceId,
            phones.map((one) => one.id)
          ),
          gt(deviceSwitch.expiresAt, now)
        )
      );
  }
};

/** Letters and digits nobody misreads when a code is read out across a shed: no 0/O, no 1/I. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const A_DAY = 24 * 60 * 60 * 1000;

const WHITESPACE = /\s/gu;

/**
 * What the farm keeps of a code, from however somebody typed it. A code is read out, and the Investor's Code Slip
 * prints it in two groups of four, so a gap is no part of it; nor is a lower-case letter.
 */
export const hashOfCodeAsTyped = (typed: string): Promise<string> =>
  hashToken(typed.replaceAll(WHITESPACE, "").toUpperCase());

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
  return { code, codeHash: await hashOfCodeAsTyped(code) };
};

/** The instant a visit's access ends: the close of its last farm day. A visit ending before today is no visit. */
const endOfVisit = (day: string, now: Date): Date => {
  const end = new Date(startOfFarmDay(day).getTime() + A_DAY);
  if (end <= now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A visit has to last until today at least",
      data: { refusal: "visit_until_today" },
    });
  }
  return end;
};

/** An invitation as it will stand once it is written: everything the row holds, and the code to hand over. */
export interface PlannedInvite {
  id: string;
  status: "pending" | "approved";
  /** Shown once to whoever invited them; never stored. */
  code: string;
  codeHash: string;
  email: string;
  name: string;
  roles: RoleName[];
  /** The last farm day a visiting Vet's stint lasts, and the instant it ends. */
  visitUntil: string | null;
  accessUntil: Date | null;
  /** Who wrote it, in which Role, and when — and, for the Owner's own, that it stands approved by them. */
  by: Acting;
  at: Date;
}

/**
 * An invitation worked out before anything is written: who it is for, what it grants, whether it stands
 * approved already, and the code to hand over.
 *
 * The Owner invites anybody and their invitation is approved as they make it. A Manager invites Barn Staff and
 * calls in a visiting Vet, and the Owner approves either — so a Manager cannot make a second Owner, or a Vet
 * who stays, by writing an invitation for one (roles matrix).
 *
 * Worked out before the transaction opens, like a PIN and for the same reason: the code is hashed, hashing is
 * deliberately slow, and a transaction held open while it runs is a lock held for no reason.
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
  const visit = asked.visitUntil;
  if (
    visit !== undefined &&
    !(asked.roles.length === 1 && asked.roles[0] === "vet")
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a Vet is invited for a visit",
      data: { refusal: "visit_is_for_vets" },
    });
  }
  if (
    by.role === "manager" &&
    !aManagerMayInvite(asked.roles, visit !== undefined)
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "A Manager may only invite Staff or a visiting Vet",
      data: { refusal: "manager_staff_or_visiting" },
    });
  }
  return {
    id: uuidv7(now),
    status: by.role === "owner" ? "approved" : "pending",
    ...(await newInviteCode()),
    email: asked.email,
    name: asked.name,
    roles: [...asked.roles],
    visitUntil: visit ?? null,
    accessUntil: visit === undefined ? null : endOfVisit(visit, now),
    by,
    at: now,
  };
};

/** Writes a planned invitation down, exactly as it was planned. */
export const writeInvite = async (
  tx: Tx,
  farmId: string,
  planned: PlannedInvite
): Promise<void> => {
  const approved = planned.status === "approved";
  await tx.insert(invite).values({
    id: planned.id,
    farmId,
    email: planned.email,
    name: planned.name,
    roles: planned.roles,
    status: planned.status,
    invitedBy: planned.by.id,
    invitedByRole: planned.by.role,
    approvedBy: approved ? planned.by.id : null,
    approvedAt: approved ? planned.at : null,
    codeHash: planned.codeHash,
    vetScope: planned.visitUntil === null ? null : "visiting",
    accessUntil: planned.accessUntil,
    codeIssuedAt: planned.at,
    createdAt: planned.at,
  });
};

/** The moment before which a code given has lapsed: `INVITE_LAPSE_DAYS` back from now. */
const lapsedBefore = (now: Date) =>
  new Date(now.getTime() - INVITE_LAPSE_DAYS * 24 * 60 * 60 * 1000);

/** That an invitation's code still stands: given within `INVITE_LAPSE_DAYS`, or made then where none was kept. */
const codeStillStands = (now: Date) =>
  sql`coalesce(${invite.codeIssuedAt}, ${invite.createdAt}) > ${lapsedBefore(now)}`;

/**
 * Withdraws an invitation nobody has taken up — written to the wrong address, or one the Owner does not want — so its
 * code works for nobody and its address opens no account. The Owner's, or the Manager's for an invitation he could
 * have written. The address may be invited again.
 */
export const withdrawInvite = async (
  tx: Tx,
  farmId: string,
  id: string,
  by: { role: RoleName | null }
): Promise<void> => {
  const waiting = await tx.query.invite.findFirst({
    where: { id, farmId, acceptedAt: { isNull: true } },
    columns: { roles: true, vetScope: true },
  });
  if (
    by.role === "manager" &&
    waiting &&
    !aManagerMayInvite(waiting.roles, waiting.vetScope === "visiting")
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "A Manager may only withdraw a Staff or visiting Vet invite",
      data: { refusal: "manager_staff_or_visiting" },
    });
  }
  const [row] = await tx
    .update(invite)
    .set({ status: "revoked", codeHash: null })
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
      data: { refusal: "no_invite_waiting" },
    });
  }
};

/** A new code for an invitation not yet taken up — the first one lost, or never written down. The old code
 *  stops working at once, because the row holds one hash and this replaces it. A Manager re-issues only what he
 *  could have written: a new code for the Owner's invitation would let him sign up under its address and hold its
 *  Roles himself. */
export const reissueInvite = async (
  tx: Tx,
  farmId: string,
  id: string,
  codeHash: string,
  by: { role: RoleName | null; now: Date }
): Promise<void> => {
  const waiting = await tx.query.invite.findFirst({
    where: { id, farmId, acceptedAt: { isNull: true } },
    columns: { roles: true, vetScope: true },
  });
  if (
    by.role === "manager" &&
    waiting &&
    !aManagerMayInvite(waiting.roles, waiting.vetScope === "visiting")
  ) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "A Manager may only re-issue the code of a Staff or visiting Vet invite",
      data: { refusal: "manager_staff_or_visiting" },
    });
  }
  const [row] = await tx
    .update(invite)
    // A new code stands its own fourteen days.
    .set({ codeHash, codeIssuedAt: by.now })
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
      data: { refusal: "no_invite_waiting" },
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
        isNull(invite.acceptedAt),
        // A code a fortnight old and never used has lapsed.
        codeStillStands(now)
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

/** A Barn Staff member who works only on the Shed Phones, made one of the farm's people: Barn Staff, and the invite
 *  written for them taken up. */
const takeUpForShedPhones = async (
  tx: Tx,
  farmId: string,
  inviteId: string,
  userId: string,
  by: Acting,
  now: Date
): Promise<void> => {
  await tx
    .update(invite)
    .set({ acceptedAt: now })
    .where(and(eq(invite.id, inviteId), eq(invite.farmId, farmId)));
  await grantRoles(tx, farmId, userId, ["staff"], by, now);
};

/**
 * A Barn Staff member with no email of their own, added by name to work only on the farm's Shed Phones (ADR 0003). They
 * are made with an address nothing is sent to and no password, so they never sign in; the invitation written for them
 * is what the Owner approves, as any a Manager writes. The Owner's is approved, and taken up, at once.
 */
export const addForShedPhones = async (
  tx: Tx,
  farmId: string,
  asked: { name: string },
  by: Acting,
  now: Date
): Promise<{
  userId: string;
  inviteId: string;
  status: "approved" | "pending";
}> => {
  const userId = uuidv7(now);
  const inviteId = uuidv7(now);
  const email = shedPhoneOnlyAddressOf(userId);
  const approved = by.role === "owner";
  await tx.insert(user).values({
    id: userId,
    name: asked.name,
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(invite).values({
    id: inviteId,
    farmId,
    email,
    name: asked.name,
    roles: ["staff"],
    status: approved ? "approved" : "pending",
    invitedBy: by.id,
    invitedByRole: by.role,
    approvedBy: approved ? by.id : null,
    approvedAt: approved ? now : null,
    codeHash: null,
    forUserId: userId,
    createdAt: now,
  });
  if (approved) {
    await takeUpForShedPhones(tx, farmId, inviteId, userId, by, now);
  }
  return { userId, inviteId, status: approved ? "approved" : "pending" };
};

/** The Owner approving an invitation a Manager wrote. Only a pending one of this Farm flips, so a second
 *  approver is told there is nothing to approve rather than approving it again — and, because throwing here
 *  rolls the transaction back, no Audit Event says they did. */
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
    .returning({ id: invite.id, forUserId: invite.forUserId });
  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }
  // Somebody who works only on the Shed Phones has no code to enter: approved, they are one of the farm's people.
  if (row.forUserId) {
    await takeUpForShedPhones(tx, farmId, id, row.forUserId, by, now);
  }
};

/** One person on the roster a Shed Phone caches. */
export interface OnTheRoster {
  userId: string;
  name: string;
  salt: string;
  hash: string;
}

/**
 * Who may PIN Switch on this farm's Shed Phones, and what the phone checks a PIN against.
 *
 * Everybody with a PIN whose Membership has not ended and who holds Barn Staff — a person the Owner has disabled is
 * signed out of their own phone and is nobody on a shared one either, and a Shed Phone holds Barn Staff alone (the
 * Owner's decision of 2026-10-04): the hash of anybody else's PIN on the barn's phone is a way into their Role for
 * whoever holds the phone. The phone keeps this so a Switch works with no signal (ADR 0003); what it holds is the salt
 * and the hash, never a PIN.
 */
export const theRoster = async (
  tx: Reading,
  farmId: string
): Promise<OnTheRoster[]> => {
  const staff = await tx.query.roleAssignment.findMany({
    where: { farmId, role: "staff", ...ACTIVE_ROLE },
    columns: { userId: true },
  });
  const pins = await tx.query.staffPin.findMany({
    where: { farmId, userId: { in: staff.map((one) => one.userId) } },
    columns: { userId: true, salt: true, hash: true },
  });
  const people = await tx.query.user.findMany({
    where: { id: { in: pins.map((pin) => pin.userId) } },
    columns: { id: true, name: true, disabledAt: true },
  });
  const byId = new Map(people.map((person) => [person.id, person]));
  return pins.flatMap((pin) => {
    const person = byId.get(pin.userId);
    return person && !person.disabledAt
      ? [
          {
            userId: pin.userId,
            name: person.name,
            salt: pin.salt,
            hash: pin.hash,
          },
        ]
      : [];
  });
};

/** How long a password code is worth reading out. Long enough for somebody to walk back to the shed and sit
 *  down with it, short enough that a code overheard yesterday is no longer a way in. */
const CODE_LASTS = 24 * 60 * 60 * 1000;

/** A one-time code for somebody who cannot sign in, and what the farm keeps of it. Worked out before the
 *  transaction, like a PIN and an invitation's code, because hashing is deliberately slow. */
export const newPasswordCode = async (
  now: Date
): Promise<{ code: string; codeHash: string; expiresAt: Date }> => ({
  ...(await newInviteCode()),
  expiresAt: new Date(now.getTime() + CODE_LASTS),
});

/**
 * Writes down the one code that will let this person set a password.
 *
 * One per person: issuing a second puts the first out of use, because two ways in is one more than anybody
 * asked for. Only the hash is kept, so nobody — the Owner included — can read a code back out of the farm's
 * records after it has been read out once.
 */
export const writePasswordCode = async (
  tx: Tx,
  farmId: string,
  userId: string,
  minted: { codeHash: string; expiresAt: Date },
  by: Acting,
  now: Date
): Promise<void> => {
  await accessIsTheirsToGive(
    tx,
    farmId,
    userId,
    by,
    "A Manager may only issue a password code for Barn Staff"
  );
  const values = {
    farmId,
    userId,
    codeHash: minted.codeHash,
    expiresAt: minted.expiresAt,
    usedAt: null,
    issuedBy: by.id,
    issuedByRole: by.role,
    createdAt: now,
  };
  await tx
    .insert(passwordCode)
    .values({ id: uuidv7(now), ...values })
    .onConflictDoUpdate({ target: [passwordCode.userId], set: values });
};

/** Whoever the farm knows by that email and has not shown the door. Nothing for anybody else, which is the
 *  same answer a wrong code gets: somebody guessing learns neither. */
export const personByEmail = async (
  tx: Reading,
  email: string
): Promise<{ id: string; name: string } | null> => {
  const person = await tx.query.user.findFirst({
    where: { email: email.toLowerCase() },
    columns: { id: true, name: true, disabledAt: true },
  });
  return person && !person.disabledAt
    ? { id: person.id, name: person.name }
    : null;
};

/**
 * Takes the code back off them.
 *
 * Refused for a code this farm is not holding, one that has been spent, and one that has gone stale — each the
 * same way, because somebody guessing should not be told which of the three they have.
 */
export const spendPasswordCode = async (
  tx: Tx,
  farmId: string,
  userId: string,
  codeHash: string,
  now: Date
): Promise<void> => {
  const [spent] = await tx
    .update(passwordCode)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordCode.farmId, farmId),
        eq(passwordCode.userId, userId),
        eq(passwordCode.codeHash, codeHash),
        isNull(passwordCode.usedAt),
        gt(passwordCode.expiresAt, now)
      )
    )
    .returning({ id: passwordCode.id });
  if (!spent) {
    throw new ORPCError("NOT_FOUND", {
      message: "That code is not right",
      data: { refusal: "code_not_valid" },
    });
  }
};
