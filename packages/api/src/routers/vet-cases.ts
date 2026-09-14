import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull, lte } from "@OpenFarm/db/operators";
import { roleAssignment } from "@OpenFarm/db/schema/farm";
import { vetCase } from "@OpenFarm/db/schema/health";
import { startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import type { Context } from "../context";
import { farmDay } from "../farm-clock";
import { loadLiveAnimal, requireAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";
import { onTheirCases } from "../visiting-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The visiting Vets whose visit has not ended, for the farm to call in about an animal. */
const visitingVetsOf = async (
  context: Context & { farm: NonNullable<Context["farm"]> }
) => {
  const now = context.clock.now();
  const rows = await context.db.query.roleAssignment.findMany({
    where: {
      farmId: context.farm.id,
      role: "vet",
      scope: "visiting",
      revokedAt: { isNull: true },
    },
    columns: { userId: true, expiresAt: true },
    with: { user: { columns: { id: true, name: true, disabledAt: true } } },
  });
  return rows
    .filter(
      (row) =>
        row.user &&
        !row.user.disabledAt &&
        (!row.expiresAt || row.expiresAt > now)
    )
    .map((row) => ({
      id: row.userId,
      name: row.user?.name ?? "",
      visitUntil: row.expiresAt,
    }));
};

/**
 * Ends every visit whose day has passed: the Role is revoked on the day it ran out, and the visiting Vet's open Cases
 * close with it. Run by the farm's schedule; a request already refuses an expired visit before this gets round to it.
 */
export const endExpiredVisits = async (
  context: Context & { farm: NonNullable<Context["farm"]> }
): Promise<number> => {
  const now = context.clock.now();
  const ended = await context.db.query.roleAssignment.findMany({
    where: {
      farmId: context.farm.id,
      role: "vet",
      scope: "visiting",
      revokedAt: { isNull: true },
      expiresAt: { lte: now },
    },
    columns: { id: true, userId: true, expiresAt: true },
  });
  for (const visit of ended) {
    // oxlint-disable-next-line no-await-in-loop
    await audited(context).write(
      {
        entity: "user",
        entityId: visit.userId,
        action: "update",
        after: {
          visitEndedAt: visit.expiresAt?.toISOString() ?? null,
          source: "visit ran out",
        },
      },
      async (tx) => {
        await tx
          .update(roleAssignment)
          .set({ revokedAt: visit.expiresAt ?? now })
          .where(
            and(
              eq(roleAssignment.id, visit.id),
              isNull(roleAssignment.revokedAt),
              lte(roleAssignment.expiresAt, now)
            )
          );
        await tx
          .update(vetCase)
          .set({ closedAt: now })
          .where(
            and(
              eq(vetCase.farmId, context.farm.id),
              eq(vetCase.vetId, visit.userId),
              isNull(vetCase.closedAt)
            )
          );
      }
    );
  }
  return ended.length;
};

export const vetCasesRouter = {
  /** The visiting Vets the farm can call in right now. */
  visitingVets: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => visitingVetsOf(context)),

  /** An animal's open Cases, and who is on each. */
  forAnimal: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ tagNumber: z.string().trim().min(1).max(32) }))
    .handler(async ({ context, input }) => {
      const her = await requireAnimal(
        context.db,
        context.farm.id,
        input.tagNumber.toUpperCase()
      );
      const rows = await context.db.query.vetCase.findMany({
        where: {
          farmId: context.farm.id,
          animalId: her.id,
          closedAt: { isNull: true },
        },
        orderBy: { openedAt: "desc" },
        with: {
          vet: { columns: { name: true } },
          opener: { columns: { name: true } },
        },
      });
      return rows.map(({ vet, opener, ...row }) => ({
        ...row,
        vetName: vet.name,
        openedByName: opener?.name ?? null,
      }));
    }),

  /**
   * Calls a visiting Vet in about one animal: from now until the Case is closed or their visit ends, they may see her,
   * diagnose her, prescribe for her and give her doses.
   */
  open: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(32),
        vetId: z.string(),
        reason: z.string().trim().min(1).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      const vets = await visitingVetsOf(context);
      if (!vets.some((vet) => vet.id === input.vetId)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That person is not a visiting vet on this farm now",
        });
      }
      await audited(context).write(
        { entity: "vet_case", entityId: id, action: "create", after: input },
        async (tx) => {
          const her = await loadLiveAnimal(
            tx,
            context.farm.id,
            input.tagNumber.toUpperCase()
          );
          const [row] = await tx
            .insert(vetCase)
            .values({
              id,
              farmId: context.farm.id,
              animalId: her.id,
              vetId: input.vetId,
              reason: input.reason,
              openedBy: context.actor.id,
              openedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: vetCase.id });
          if (!row) {
            throw new ORPCError("CONFLICT", {
              message: "That vet already has a case open on her",
            });
          }
        }
      );
      return { id };
    }),

  /** Closes a Case: the farm has what it needed from the vet about her, or the vet has finished. */
  close: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const standing = await context.db.query.vetCase.findFirst({
        where: {
          id: input.id,
          farmId: context.farm.id,
          closedAt: { isNull: true },
        },
        columns: { id: true, vetId: true },
      });
      const runsTheFarm =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      if (!standing || !(runsTheFarm || standing.vetId === context.actor.id)) {
        throw new ORPCError("NOT_FOUND", { message: "No such open case" });
      }
      await audited(context).write(
        {
          entity: "vet_case",
          entityId: standing.id,
          action: "update",
          after: { closedAt: now.toISOString() },
        },
        async (tx) => {
          await tx
            .update(vetCase)
            .set({ closedAt: now, closedBy: context.actor.id })
            .where(and(eq(vetCase.id, standing.id), isNull(vetCase.closedAt)));
        }
      );
      return { id: standing.id };
    }),

  /** A Vet's own open Cases: the animals they were called in for, and why. */
  mine: protectedProcedure
    .use(requireRole("vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.vetCase.findMany({
        where: {
          farmId: context.farm.id,
          vetId: context.actor.id,
          closedAt: { isNull: true },
        },
        orderBy: { openedAt: "desc" },
        with: {
          animal: { columns: { tagNumber: true, state: true, side: true } },
        },
      });
      return {
        visiting: onTheirCases(context),
        cases: rows.map(({ animal, ...row }) => ({
          ...row,
          tagNumber: animal.tagNumber,
          state: animal.state,
        })),
      };
    }),

  /** Moves a visit's last day — longer, or ended today. The Owner approves visiting access, so the Owner changes it. */
  setVisitUntil: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), visitUntil: farmDay }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      // The close of that farm day, as an invite's visit ends.
      const until = new Date(
        startOfFarmDay(input.visitUntil).getTime() + DAY_MS
      );
      if (until <= now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A visit has to last until today at least",
        });
      }
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          after: { visitUntil: input.visitUntil },
        },
        async (tx) => {
          const [row] = await tx
            .update(roleAssignment)
            .set({ expiresAt: until })
            .where(
              and(
                eq(roleAssignment.farmId, context.farm.id),
                eq(roleAssignment.userId, input.userId),
                eq(roleAssignment.role, "vet"),
                eq(roleAssignment.scope, "visiting"),
                isNull(roleAssignment.revokedAt)
              )
            )
            .returning({ id: roleAssignment.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "No visit to change for that person",
            });
          }
        }
      );
      return { userId: input.userId, visitUntil: input.visitUntil };
    }),

  /** Ends a visit now: the Role is revoked, and the visiting Vet's open Cases close with it. */
  endVisit: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          after: { visitEndedAt: now.toISOString() },
        },
        async (tx) => {
          const [row] = await tx
            .update(roleAssignment)
            .set({ revokedAt: now })
            .where(
              and(
                eq(roleAssignment.farmId, context.farm.id),
                eq(roleAssignment.userId, input.userId),
                eq(roleAssignment.role, "vet"),
                eq(roleAssignment.scope, "visiting"),
                isNull(roleAssignment.revokedAt)
              )
            )
            .returning({ id: roleAssignment.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "No visit to end for that person",
            });
          }
          await tx
            .update(vetCase)
            .set({ closedAt: now, closedBy: context.actor.id })
            .where(
              and(
                eq(vetCase.farmId, context.farm.id),
                eq(vetCase.vetId, input.userId),
                isNull(vetCase.closedAt)
              )
            );
        }
      );
      return { userId: input.userId };
    }),
};
