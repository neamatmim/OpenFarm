import type { Database } from "@OpenFarm/db";
import { and, eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { ROLES, invite, roleAssignment } from "@OpenFarm/db/schema/farm";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const roleSchema = z.enum(ROLES);

const requireFarm = (context: { farm: { id: string } | null }) => {
  if (!context.farm) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "The farm is not set up yet",
    });
  }
  return context.farm;
};

/** Grants an approved invite's Roles to the person with that email, if they exist. */
const applyApprovedInvites = async (
  db: Database,
  farmId: string,
  email: string,
  granter: { id: string; role: RoleName },
  now: Date
) => {
  const person = await db.query.user.findFirst({
    where: { email },
    columns: { id: true },
  });
  if (!person) {
    return;
  }
  const approved = await db.query.invite.findMany({
    where: { farmId, email, status: "approved" },
    columns: { roles: true },
  });
  const roles = [...new Set(approved.flatMap((i) => i.roles))];
  if (roles.length === 0) {
    return;
  }
  await db
    .insert(roleAssignment)
    .values(
      roles.map((role) => ({
        id: crypto.randomUUID(),
        farmId,
        userId: person.id,
        role,
        grantedBy: granter.id,
        grantedByRole: granter.role,
        createdAt: now,
      }))
    )
    .onConflictDoNothing();
};

export const peopleRouter = {
  /** Who am I on this Farm. */
  me: protectedProcedure.handler(({ context }) => ({
    id: context.session.user.id,
    name: context.session.user.name,
    roles: context.roles,
    penIds: context.penIds,
    disabled: Boolean(context.person?.disabledAt),
  })),

  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const farmId = requireFarm(context).id;
      const people = await context.db.query.user.findMany({
        columns: { id: true, name: true, email: true, disabledAt: true },
        with: { roles: { where: { farmId }, columns: { role: true } } },
        orderBy: { name: "asc" },
      });
      const invites = await context.db.query.invite.findMany({
        where: { farmId, status: "pending" },
        columns: {
          id: true,
          email: true,
          name: true,
          roles: true,
          invitedByRole: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
      return {
        people: people.map((p) => ({
          ...p,
          roles: p.roles.map((r) => r.role),
        })),
        pendingInvites: invites,
      };
    }),

  /** Owner invites anyone with any Roles (approved at once); Manager invites Staff (pending). */
  invite: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        email: z.email().trim().toLowerCase(),
        name: z.string().trim().min(1),
        roles: z.array(roleSchema).min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = requireFarm(context).id;
      const now = context.clock.now();
      const actor = { id: context.session.user.id, role: context.roleUsed };
      if (actor.role === "manager" && input.roles.some((r) => r !== "staff")) {
        throw new ORPCError("FORBIDDEN", {
          message: "A Manager may only invite Staff",
        });
      }
      const approvedNow = actor.role === "owner";
      const id = crypto.randomUUID();
      await context.db.insert(invite).values({
        id,
        farmId,
        email: input.email,
        name: input.name,
        roles: input.roles,
        status: approvedNow ? "approved" : "pending",
        invitedBy: actor.id,
        invitedByRole: actor.role,
        approvedBy: approvedNow ? actor.id : null,
        approvedAt: approvedNow ? now : null,
        createdAt: now,
      });
      if (approvedNow) {
        await applyApprovedInvites(context.db, farmId, input.email, actor, now);
      }
      return { id, status: approvedNow ? "approved" : "pending" } as const;
    }),

  approveInvite: protectedProcedure
    .use(requireRole("owner"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const farmId = requireFarm(context).id;
      const now = context.clock.now();
      const [row] = await context.db
        .update(invite)
        .set({
          status: "approved",
          approvedBy: context.session.user.id,
          approvedAt: now,
        })
        .where(
          and(
            eq(invite.id, input.id),
            eq(invite.farmId, farmId),
            eq(invite.status, "pending")
          )
        )
        .returning({ email: invite.email });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      await applyApprovedInvites(
        context.db,
        farmId,
        row.email,
        { id: context.session.user.id, role: context.roleUsed },
        now
      );
      return { id: input.id, status: "approved" } as const;
    }),

  /** Owner sets a person's Roles outright (replaces what they hold). */
  assignRoles: protectedProcedure
    .use(requireRole("owner"))
    .input(z.object({ userId: z.string(), roles: z.array(roleSchema) }))
    .handler(async ({ context, input }) => {
      const farmId = requireFarm(context).id;
      const now = context.clock.now();
      await context.db.transaction(async (tx) => {
        await tx
          .delete(roleAssignment)
          .where(
            and(
              eq(roleAssignment.farmId, farmId),
              eq(roleAssignment.userId, input.userId)
            )
          );
        const roles = [...new Set(input.roles)];
        if (roles.length > 0) {
          await tx.insert(roleAssignment).values(
            roles.map((role) => ({
              id: crypto.randomUUID(),
              farmId,
              userId: input.userId,
              role,
              grantedBy: context.session.user.id,
              grantedByRole: context.roleUsed,
              createdAt: now,
            }))
          );
        }
      });
      return { userId: input.userId, roles: [...new Set(input.roles)] };
    }),

  /** Owner removes a person's access. Their records and history remain. */
  disable: protectedProcedure
    .use(requireRole("owner"))
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      if (input.userId === context.session.user.id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You cannot disable yourself",
        });
      }
      const [row] = await context.db
        .update(user)
        .set({ disabledAt: context.clock.now() })
        .where(eq(user.id, input.userId))
        .returning({ id: user.id });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return { userId: row.id, disabled: true };
    }),

  enable: protectedProcedure
    .use(requireRole("owner"))
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db
        .update(user)
        .set({ disabledAt: null })
        .where(eq(user.id, input.userId));
      return { userId: input.userId, disabled: false };
    }),
};
