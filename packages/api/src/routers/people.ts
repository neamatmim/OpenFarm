import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { session as sessionTable, user } from "@OpenFarm/db/schema/auth";
import { staffPin } from "@OpenFarm/db/schema/device";
import { ACTIVE_ROLE, ROLES, invite } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ASSIGNMENT, penAssignment } from "@OpenFarm/db/schema/herd";
import {
  derivePinHash,
  isPin,
  randomPinSalt,
  startOfFarmDay,
} from "@OpenFarm/domain";
import type { SopContent } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { CODE_ATTEMPTS, countFailure, lockedOut } from "../attempts";
import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import { nameCorrection, nameCorrectionInput } from "../corrections/name";
import { hashToken } from "../device";
import { farmDay } from "../farm-clock";
import { protectedProcedure, publicProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";
import { activeRolesFor, grantRoles, revokeRoles } from "../roles-store";
import { scopesOf } from "../scope";

const roleSchema = z.enum(ROLES);

const personSnapshot = async (tx: Tx, userId: string) => {
  const row = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { name: true, disabledAt: true },
  });
  return row ? { name: row.name, disabledAt: row.disabledAt } : null;
};

/** Letters and digits nobody misreads when a code is read out across a shed: no 0/O, no 1/I. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** The instant a visit's access ends: the close of its last farm day. A visit ending before today is no visit. */
const endOfVisit = (day: string, now: Date): Date => {
  const end = new Date(startOfFarmDay(day).getTime() + 24 * 60 * 60 * 1000);
  if (end <= now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A visit has to last until today at least",
    });
  }
  return end;
};

/** A fresh invitation code, and what the farm keeps of it. */
const newInviteCode = async (): Promise<{ code: string; codeHash: string }> => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const code = Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]
  ).join("");
  return { code, codeHash: await hashToken(code) };
};

/** One teaching, as a person's row shows it. */
export interface TaughtOnce {
  id: string;
  definitionId: string;
  versionNumber: number;
  sopName: { bn: string; en?: string };
  trainedAt: Date;
}

/** The number as it stands, for the trail to record either side of a change. */
const readPhone = async (tx: Tx, userId: string) => {
  const row = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { phone: true },
  });
  return row ?? null;
};

/** A number as the farm writes it down. Not validated into a shape: a farm writes numbers the
 *  way the people who use them do, and a gateway that cannot dial one will say so. */
const phoneInput = z.string().trim().min(6).max(20);

export const peopleRouter = {
  /**
   * The number the farm can text. Your own always; somebody else's if you run the farm, because
   * a Manager writing down the Owner's number from a scrap of paper is how a farm actually gets
   * these.
   *
   * Only the two safety notices go by text — a Withdrawal ending and a notifiable Diagnosis —
   * and a person with no number simply does not get those; the in-app Alert is the record.
   */
  setPhone: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({
        /** Whose. Left out, your own. */
        userId: z.string().optional(),
        /** Cleared by sending nothing at all. */
        phone: phoneInput.nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const whose = input.userId ?? context.actor.id;
      const mine = whose === context.actor.id;
      const runsTheFarm =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      if (!(mine || runsTheFarm)) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only you, or whoever runs the farm, may write down your number",
        });
      }
      if (!mine) {
        // Somebody on this Farm. The user table belongs to the whole database, and a Manager
        // here has no standing over a person who is not theirs.
        const theirs = await context.db.query.roleAssignment.findFirst({
          where: { farmId: context.farm.id, userId: whose, ...ACTIVE_ROLE },
          columns: { role: true },
        });
        if (!theirs) {
          throw new ORPCError("NOT_FOUND", {
            message: "Nobody on this farm by that name",
          });
        }
        // The Owner's own number is the Owner's. It is where the farm's safety messages go, and
        // a Manager who could redirect or blank it could quietly stop them arriving.
        if (theirs.role === "owner" && context.roleUsed !== "owner") {
          throw new ORPCError("FORBIDDEN", {
            message: "The Owner writes down their own number",
            data: { refusal: "owner_writes_their_own" },
          });
        }
      }
      await audited(context).write(
        {
          entity: "user",
          entityId: whose,
          action: "update",
          // What it was, as well as what it is: this is the number the farm's safety messages
          // go to, and a trail that cannot show what was replaced is no help at all.
          before: (tx) => readPhone(tx, whose),
          after: (tx) => readPhone(tx, whose),
        },
        (tx) =>
          tx
            .update(user)
            .set({ phone: input.phone ?? null })
            .where(eq(user.id, whose))
      );
      return { userId: whose };
    }),

  /** Who am I on this Farm. */
  me: protectedProcedure.handler(({ context }) => ({
    id: context.actor.id,
    name: context.actor.name,
    // Which farm, by name — not its settings: thresholds and windows are read where a Role may read them
    // (farm.current, farm.identity), and a visiting Vet or somebody holding no Role yet may not.
    farm: context.farm
      ? { id: context.farm.id, name: context.farm.name }
      : null,
    roles: context.roles,
    /** What they may see and record under each Role they hold — the farm, their Pens, their Cases, or their Pens or
     *  their Cases — worked out by the same Scope every procedure is held to, so a screen shows what each of their
     *  Roles lets them reach rather than working the rule out again. */
    scopes: scopesOf(context),
    /** The number the farm can text, so a screen can show what is written down. */
    phone: context.person?.phone ?? null,
    disabled: Boolean(context.person?.disabledAt),
  })),

  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const farmId = context.farm.id;
      const inviteColumns = {
        id: true,
        email: true,
        name: true,
        roles: true,
        invitedByRole: true,
        acceptedAt: true,
        accessUntil: true,
        createdAt: true,
      } as const;
      const [people, pending, approved] = await Promise.all([
        context.db.query.user.findMany({
          columns: { id: true, name: true, email: true, disabledAt: true },
          with: {
            roles: {
              where: { farmId, ...ACTIVE_ROLE },
              columns: { role: true, scope: true, expiresAt: true },
            },
          },
          orderBy: { name: "asc" },
        }),
        context.db.query.invite.findMany({
          where: { farmId, status: "pending" },
          columns: inviteColumns,
          orderBy: { createdAt: "asc" },
        }),
        context.db.query.invite.findMany({
          where: { farmId, status: "approved" },
          columns: inviteColumns,
          orderBy: { createdAt: "asc" },
        }),
      ]);
      const assignments = await context.db.query.penAssignment.findMany({
        where: { farmId, ...ACTIVE_ASSIGNMENT },
        columns: { userId: true, penId: true },
      });
      // What everybody has been taught, in one question rather than one per person.
      const taught = await context.db.query.sopTraining.findMany({
        where: { farmId },
        orderBy: { trainedAt: "desc" },
        with: { version: { columns: { number: true, content: true } } },
      });
      const theirTraining = new Map<string, TaughtOnce[]>();
      for (const row of taught) {
        const forThem = theirTraining.get(row.userId) ?? [];
        forThem.push({
          id: row.id,
          definitionId: row.definitionId,
          versionNumber: row.version.number,
          sopName: (row.version.content as SopContent).name,
          trainedAt: row.trainedAt,
        });
        theirTraining.set(row.userId, forThem);
      }
      return {
        people: people.map((p) => ({
          ...p,
          roles: p.roles.map((r) => r.role),
          /** When a visiting Vet's access ends; null for everyone else. */
          visitUntil:
            p.roles.find((r) => r.role === "vet" && r.scope === "visiting")
              ?.expiresAt ?? null,
          /** The Pens whose work is theirs. */
          penIds: assignments
            .filter((row) => row.userId === p.id)
            .map((row) => row.penId),
          training: theirTraining.get(p.id) ?? [],
        })),
        pendingInvites: pending,
        /** Approved, but the person has not signed up yet — Roles are granted when they do. */
        awaitingSignup: approved.filter((i) => !i.acceptedAt),
      };
    }),

  /** Owner invites anyone with any Roles (approved at once); Manager invites Staff (pending). */
  /** One person of this farm, and what they have been taught. Anybody may ask about
   *  themselves — the person who has to follow a procedure should be able to see when they
   *  were taught it — and the Manager may ask about anybody who works here. */
  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      const aboutThemselves = input.userId === context.actor.id;
      const runsTheFarm =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      if (!(aboutThemselves || runsTheFarm)) {
        throw new ORPCError("FORBIDDEN");
      }
      const person = await context.db.query.user.findFirst({
        where: { id: input.userId },
        columns: { id: true, name: true, email: true, disabledAt: true },
        with: {
          roles: {
            where: { farmId: context.farm.id, ...ACTIVE_ROLE },
            columns: { role: true },
          },
        },
      });
      // Somebody with no Role here is not this farm's business to talk about.
      if (!person || person.roles.length === 0) {
        throw new ORPCError("NOT_FOUND", { message: "No such person" });
      }
      const training = await context.db.query.sopTraining.findMany({
        where: { farmId: context.farm.id, userId: input.userId },
        orderBy: { trainedAt: "desc" },
        with: {
          version: {
            columns: { number: true, content: true, publishedAt: true },
          },
        },
      });
      return {
        ...person,
        roles: person.roles.map((role) => role.role),
        training: training.map(({ version, ...row }) => ({
          ...row,
          versionNumber: version.number,
          versionPublishedAt: version.publishedAt,
          sopName: (version.content as SopContent).name,
        })),
      };
    }),

  invite: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        email: z.email().trim().toLowerCase(),
        name: z.string().trim().min(1),
        roles: z.array(roleSchema).min(1),
        /** For a Vet called in for a visit: the last farm day their access lasts. */
        visitUntil: farmDay.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const actor = { id: context.actor.id, role: context.roleUsed };
      const visiting = input.visitUntil !== undefined;
      if (visiting && !(input.roles.length === 1 && input.roles[0] === "vet")) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only a Vet is invited for a visit",
        });
      }
      const accessUntil = visiting
        ? endOfVisit(input.visitUntil ?? "", now)
        : null;
      // A Manager invites Barn Staff and calls in a visiting Vet; the Owner approves either (roles matrix).
      const managerMay = input.roles.every((r) => r === "staff") || visiting;
      if (actor.role === "manager" && !managerMay) {
        throw new ORPCError("FORBIDDEN", {
          message: "A Manager may only invite Staff or a visiting Vet",
        });
      }
      const approvedNow = actor.role === "owner";
      const status = approvedNow ? "approved" : "pending";
      const id = uuidv7(now);
      const { code, codeHash } = await newInviteCode();
      await audited(context).write(
        {
          entity: "invite",
          entityId: id,
          action: "create",
          after: {
            email: input.email,
            name: input.name,
            roles: input.roles,
            status,
            visitUntil: input.visitUntil ?? null,
          },
        },
        async (tx) => {
          await tx.insert(invite).values({
            id,
            farmId,
            email: input.email,
            name: input.name,
            roles: input.roles,
            status,
            invitedBy: actor.id,
            invitedByRole: actor.role,
            approvedBy: approvedNow ? actor.id : null,
            approvedAt: approvedNow ? now : null,
            codeHash,
            vetScope: visiting ? "visiting" : null,
            accessUntil,
            createdAt: now,
          });
        }
      );
      // The code is shown once, to whoever invited them, to hand over in person; the farm keeps only its hash.
      return { id, status, code } as const;
    }),

  /**
   * A new code for an invite not yet taken up — the first one lost, or never written down. The old code stops
   * working at once.
   */
  reissueInviteCode: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const { code, codeHash } = await newInviteCode();
      await audited(context).write(
        {
          entity: "invite",
          entityId: input.id,
          action: "update",
          after: { code: "reissued" },
        },
        async (tx) => {
          const [row] = await tx
            .update(invite)
            .set({ codeHash })
            .where(
              and(
                eq(invite.id, input.id),
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
        }
      );
      return { id: input.id, code };
    }),

  /**
   * Taking up an invite: the person signed in with the email they were invited under enters the code they were
   * handed, and receives the invite's Roles. The code works once, only once the Owner has approved the invite, and
   * only for that email — so somebody who signs up first with another person's address gets nothing.
   */
  acceptInvite: protectedProcedure
    .use(requirePersonalSession())
    .input(z.object({ code: z.string().trim().min(4).max(32) }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm?.id;
      const email = context.session?.user.email.toLowerCase();
      if (!(farmId && email)) {
        throw new ORPCError("NOT_FOUND", { message: "That code is not right" });
      }
      const now = context.clock.now();
      const guesses = `invite:${context.actor.id}`;
      if (lockedOut(guesses, now, CODE_ATTEMPTS)) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many wrong codes — wait fifteen minutes",
        });
      }
      const codeHash = await hashToken(input.code.toUpperCase());
      let roles: (typeof ROLES)[number][] = [];
      await audited(context).write(
        {
          entity: "user",
          entityId: context.actor.id,
          action: "update",
          after: () => Promise.resolve({ roles, source: "invite accepted" }),
        },
        async (tx) => {
          const [row] = await tx
            .update(invite)
            .set({ codeHash: null, acceptedAt: now })
            .where(
              and(
                eq(invite.farmId, farmId),
                eq(invite.codeHash, codeHash),
                eq(invite.email, email),
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
            countFailure(guesses, now, CODE_ATTEMPTS);
            throw new ORPCError("NOT_FOUND", {
              message: "That code is not right",
            });
          }
          roles = [...row.roles];
          await grantRoles(
            tx,
            farmId,
            context.actor.id,
            roles,
            { id: row.approvedBy ?? context.actor.id, role: "owner" },
            now,
            { reactivate: true, visitUntil: row.accessUntil ?? undefined }
          );
        }
      );
      return { roles };
    }),

  approveInvite: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const actor = { id: context.actor.id, role: context.roleUsed };
      await audited(context).write(
        {
          entity: "invite",
          entityId: input.id,
          action: "update",
          before: { status: "pending" },
          after: async (tx) => {
            const row = await tx.query.invite.findFirst({
              where: { id: input.id },
              columns: { status: true, email: true, roles: true },
            });
            return row ?? null;
          },
        },
        async (tx) => {
          // Atomic: only a pending invite of this Farm flips; a second approver gets NOT_FOUND
          // and no audit row, because throwing here rolls the transaction back.
          const [row] = await tx
            .update(invite)
            .set({ status: "approved", approvedBy: actor.id, approvedAt: now })
            .where(
              and(
                eq(invite.id, input.id),
                eq(invite.farmId, farmId),
                eq(invite.status, "pending")
              )
            )
            .returning({ email: invite.email, roles: invite.roles });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { id: input.id, status: "approved" } as const;
    }),

  /** Owner sets a person's Roles outright. Kept Roles are untouched; revoked ones keep their
   *  history; the farm always keeps at least one other Owner. */
  /**
   * Which Pens' work is a person's: the Manager adds and takes away Pens, and the change is in the trail with the
   * whole list either side of it. A Staff member sees the work, animals and withdrawals of their Pens only, so a
   * newcomer with no Pens has nothing to do until this is done.
   */
  assignPens: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        userId: z.string(),
        add: z.array(z.string()).max(200),
        remove: z.array(z.string()).max(200),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const named = [...new Set([...input.add, ...input.remove])];
      const pens = named.length
        ? await context.db.query.pen.findMany({
            where: { farmId, id: { in: named } },
            columns: { id: true },
          })
        : [];
      if (pens.length !== named.length) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such Pen on this farm",
        });
      }
      const penIdsOf = async (tx: Tx) => {
        const rows = await tx.query.penAssignment.findMany({
          where: { farmId, userId: input.userId, ...ACTIVE_ASSIGNMENT },
          columns: { penId: true },
        });
        return rows.map((row) => row.penId).toSorted();
      };
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: async (tx) => ({ penIds: await penIdsOf(tx) }),
          after: async (tx) => ({ penIds: await penIdsOf(tx) }),
        },
        async (tx) => {
          const person = await tx.query.user.findFirst({
            where: { id: input.userId },
            columns: { id: true },
          });
          if (!person) {
            throw new ORPCError("NOT_FOUND", {
              message: "Nobody on this farm by that name",
            });
          }
          const held = new Set(await penIdsOf(tx));
          const adding = [...new Set(input.add)].filter(
            (penId) => !held.has(penId)
          );
          if (adding.length > 0) {
            // A Pen handed back reopens the old assignment rather than starting a second one.
            await tx
              .insert(penAssignment)
              .values(
                adding.map((penId) => ({
                  id: uuidv7(now),
                  farmId,
                  userId: input.userId,
                  penId,
                  createdAt: now,
                }))
              )
              .onConflictDoUpdate({
                target: [penAssignment.userId, penAssignment.penId],
                set: { endedAt: null },
              });
          }
          if (input.remove.length > 0) {
            await tx
              .update(penAssignment)
              .set({ endedAt: now })
              .where(
                and(
                  eq(penAssignment.farmId, farmId),
                  eq(penAssignment.userId, input.userId),
                  inArray(penAssignment.penId, input.remove),
                  isNull(penAssignment.endedAt)
                )
              );
          }
        }
      );
      const assigned = await context.db.query.penAssignment.findMany({
        where: { farmId, userId: input.userId, ...ACTIVE_ASSIGNMENT },
        columns: { penId: true },
      });
      return { userId: input.userId, penIds: assigned.map((row) => row.penId) };
    }),

  assignRoles: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), roles: z.array(roleSchema) }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const wanted = [...new Set(input.roles)];
      const actor = { id: context.actor.id, role: context.roleUsed };
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: async (tx) => ({
            roles: await activeRolesFor(tx, farmId, input.userId),
          }),
          after: { roles: wanted },
        },
        async (tx) => {
          const held = await activeRolesFor(tx, farmId, input.userId);
          const losingOwner =
            held.includes("owner") && !wanted.includes("owner");
          if (losingOwner) {
            const owners = await tx.query.roleAssignment.findMany({
              where: { farmId, role: "owner", ...ACTIVE_ROLE },
              columns: { userId: true },
            });
            const others = owners.filter((o) => o.userId !== input.userId);
            if (input.userId === actor.id || others.length === 0) {
              throw new ORPCError("BAD_REQUEST", {
                message: "The farm must keep at least one other Owner",
              });
            }
          }
          await revokeRoles(
            tx,
            farmId,
            input.userId,
            held.filter((r) => !wanted.includes(r)),
            now
          );
          await grantRoles(tx, farmId, input.userId, wanted, actor, now, {
            reactivate: true,
          });
        }
      );
      return { userId: input.userId, roles: wanted };
    }),

  /** Owner removes a person's access: signed out everywhere, records and history remain. */
  disable: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      if (input.userId === context.actor.id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You cannot disable yourself",
        });
      }
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: (tx) => personSnapshot(tx, input.userId),
          after: (tx) => personSnapshot(tx, input.userId),
        },
        async (tx) => {
          const [row] = await tx
            .update(user)
            .set({ disabledAt: now })
            .where(eq(user.id, input.userId))
            .returning({ id: user.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
          // Sessions are expired, not deleted, so the record stays.
          await tx
            .update(sessionTable)
            .set({ expiresAt: now, updatedAt: now })
            .where(eq(sessionTable.userId, input.userId));
        }
      );
      return { userId: input.userId, disabled: true };
    }),

  enable: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: (tx) => personSnapshot(tx, input.userId),
          after: (tx) => personSnapshot(tx, input.userId),
        },
        async (tx) => {
          const [row] = await tx
            .update(user)
            .set({ disabledAt: null })
            .where(eq(user.id, input.userId))
            .returning({ id: user.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { userId: input.userId, disabled: false };
    }),

  /** A Correction: the Owner fixes a person's name with a reason; the old name stays readable. */
  correctName: protectedProcedure
    .use(requireRole(...nameCorrection.roles))
    .use(requirePersonalSession())
    .input(nameCorrectionInput)
    .handler(async ({ context, input }) => {
      await correct(context, nameCorrection, input);
      return { userId: input.id, name: input.changes.name?.to };
    }),

  /** Sets or rotates a Staff member's PIN. The PIN itself is never stored: the phone gets a
   *  salt and a derived hash so PIN Switch works with no signal (ADR 0003). */
  setPin: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), pin: z.string().trim() }))
    .handler(async ({ context, input }) => {
      if (!isPin(input.pin)) {
        throw new ORPCError("BAD_REQUEST", { message: "A PIN is four digits" });
      }
      const now = context.clock.now();
      const salt = randomPinSalt();
      const hash = await derivePinHash(input.pin, salt);
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          after: { pinSet: true },
        },
        async (tx) => {
          const person = await tx.query.user.findFirst({
            where: { id: input.userId },
            columns: { id: true },
            with: {
              roles: { where: { farmId: context.farm.id, ...ACTIVE_ROLE } },
            },
          });
          if (!person || person.roles.length === 0) {
            throw new ORPCError("NOT_FOUND", {
              message: "That person is not on this farm",
            });
          }
          // A Manager may only give a PIN to Staff: a PIN is how a person acts on a shared
          // phone, so letting a Manager set an Owner's PIN would route around the rule that
          // only the Owner grants Roles above Staff.
          const targetRoles = person.roles.map((role) => role.role);
          const staffOnly = targetRoles.every((role) => role === "staff");
          if (context.roleUsed === "manager" && !staffOnly) {
            throw new ORPCError("FORBIDDEN", {
              message: "A Manager may only set a PIN for Barn Staff",
            });
          }
          await tx
            .insert(staffPin)
            .values({
              id: uuidv7(now),
              userId: input.userId,
              farmId: context.farm.id,
              salt,
              hash,
              setBy: context.actor.id,
              setByRole: context.roleUsed,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [staffPin.userId, staffPin.farmId],
              set: {
                salt,
                hash,
                setBy: context.actor.id,
                setByRole: context.roleUsed,
                updatedAt: now,
              },
            });
        }
      );
      return { userId: input.userId, pinSet: true };
    }),

  /** The roster a Shed Phone caches: who may PIN Switch on it, and what to check against.
   *  Only reachable with a device token — that token is the gate, and it is revocable. */
  roster: publicProcedure.handler(async ({ context }) => {
    if (!context.device) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only a shed phone may read the roster",
      });
    }
    const farmId = context.farm?.id;
    if (!farmId) {
      return [];
    }
    const pins = await context.db.query.staffPin.findMany({
      where: { farmId },
      columns: { userId: true, salt: true, hash: true, updatedAt: true },
    });
    const people = await context.db.query.user.findMany({
      where: { id: { in: pins.map((p) => p.userId) } },
      columns: { id: true, name: true, disabledAt: true },
    });
    const byId = new Map(people.map((person) => [person.id, person]));
    return pins
      .filter(
        (pin) => byId.get(pin.userId) && !byId.get(pin.userId)?.disabledAt
      )
      .map((pin) => ({
        userId: pin.userId,
        name: byId.get(pin.userId)?.name ?? "",
        salt: pin.salt,
        hash: pin.hash,
      }));
  }),
};
