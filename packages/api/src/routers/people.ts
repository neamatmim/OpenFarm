import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { session as sessionTable, user } from "@OpenFarm/db/schema/auth";
import { staffPin } from "@OpenFarm/db/schema/device";
import { ACTIVE_ROLE, ROLES, invite } from "@OpenFarm/db/schema/farm";
import { derivePinHash, isPin, randomPinSalt } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure, publicProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";
import { activeRolesFor, grantRoles, revokeRoles } from "../roles-store";

const roleSchema = z.enum(ROLES);

const personSnapshot = async (tx: Tx, userId: string) => {
  const row = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { name: true, disabledAt: true },
  });
  return row ? { name: row.name, disabledAt: row.disabledAt } : null;
};

/** Grants an approved invite's Roles to the person with that email, if they have signed up. */
const grantInvite = async (
  tx: Tx,
  farmId: string,
  email: string,
  roles: readonly (typeof ROLES)[number][],
  granter: { id: string; role: (typeof ROLES)[number] },
  now: Date
) => {
  const person = await tx.query.user.findFirst({
    where: { email },
    columns: { id: true },
  });
  if (person) {
    await grantRoles(tx, farmId, person.id, roles, granter, now);
  }
};

export const peopleRouter = {
  /** Who am I on this Farm. */
  me: protectedProcedure.handler(({ context }) => ({
    id: context.actor.id,
    name: context.actor.name,
    farm: context.farm,
    roles: context.roles,
    penIds: context.penIds,
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
        createdAt: true,
      } as const;
      const [people, pending, approved] = await Promise.all([
        context.db.query.user.findMany({
          columns: { id: true, name: true, email: true, disabledAt: true },
          with: {
            roles: {
              where: { farmId, ...ACTIVE_ROLE },
              columns: { role: true },
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
      const knownEmails = new Set(people.map((p) => p.email));
      return {
        people: people.map((p) => ({
          ...p,
          roles: p.roles.map((r) => r.role),
        })),
        pendingInvites: pending,
        /** Approved, but the person has not signed up yet — Roles are granted when they do. */
        awaitingSignup: approved.filter((i) => !knownEmails.has(i.email)),
      };
    }),

  /** Owner invites anyone with any Roles (approved at once); Manager invites Staff (pending). */
  invite: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        email: z.email().trim().toLowerCase(),
        name: z.string().trim().min(1),
        roles: z.array(roleSchema).min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const actor = { id: context.actor.id, role: context.roleUsed };
      if (actor.role === "manager" && input.roles.some((r) => r !== "staff")) {
        throw new ORPCError("FORBIDDEN", {
          message: "A Manager may only invite Staff",
        });
      }
      const approvedNow = actor.role === "owner";
      const status = approvedNow ? "approved" : "pending";
      const id = uuidv7(now);
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
            createdAt: now,
          });
          if (approvedNow) {
            await grantInvite(tx, farmId, input.email, input.roles, actor, now);
          }
        }
      );
      return { id, status } as const;
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
          await grantInvite(tx, farmId, row.email, row.roles, actor, now);
        }
      );
      return { id: input.id, status: "approved" } as const;
    }),

  /** Owner sets a person's Roles outright. Kept Roles are untouched; revoked ones keep their
   *  history; the farm always keeps at least one other Owner. */
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
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(
      z.object({
        userId: z.string(),
        name: z.string().trim().min(1),
        reason: z.string().trim().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "user",
        input.userId
      );
      await audit.write(
        {
          entity: "user",
          entityId: input.userId,
          action: "correct",
          before: (tx) => personSnapshot(tx, input.userId),
          after: (tx) => personSnapshot(tx, input.userId),
          reason: input.reason,
          supersedesId: previous?.id,
        },
        async (tx) => {
          const [row] = await tx
            .update(user)
            .set({ name: input.name, updatedAt: context.clock.now() })
            .where(eq(user.id, input.userId))
            .returning({ id: user.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { userId: input.userId, name: input.name };
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
