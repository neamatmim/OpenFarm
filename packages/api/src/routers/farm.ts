import { uuidv7 } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import { farm, roleAssignment } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** The Farm Parameters Release 1 actually reads. The set grows a row at a time as the
 *  increments that need them land; each one is a number the Manager may tune, never a rule
 *  hidden in the code. */
const parameters = z
  .object({
    /** Minutes of inactivity before a Shed Phone locks and asks for a PIN again. */
    pinAutoLockMinutes: z.number().int().min(1).max(120).optional(),
    /** How far the tank reading may sit from what the cows account for before the Manager
     *  is asked to look. */
    milkTolerancePercent: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    {
      message: "Nothing to change",
    }
  );

/** One advisory lock key for "creating the farm", so concurrent first-run submissions serialise. */
const BOOTSTRAP_LOCK = 7001;

/** First-run setup: the signed-in person names the Farm and becomes its Owner.
 *  Refused once a Farm exists — after that, people arrive by invitation. */
export const farmRouter = {
  bootstrap: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1) }))
    .handler(async ({ context, input }) => {
      if (context.farm) {
        throw new ORPCError("CONFLICT", { message: "The farm already exists" });
      }
      const now = context.clock.now();
      const farmId = uuidv7(now);
      const ownerId = context.actor.id;
      await audited(context, farmId).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "create",
          after: { name: input.name, ownerId },
        },
        async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`
          );
          const existing = await tx.query.farm.findFirst({
            columns: { id: true },
          });
          if (existing) {
            throw new ORPCError("CONFLICT", {
              message: "The farm already exists",
            });
          }
          await tx
            .insert(farm)
            .values({ id: farmId, name: input.name, createdAt: now });
          await tx.insert(roleAssignment).values({
            id: uuidv7(now),
            farmId,
            userId: ownerId,
            role: "owner",
            grantedBy: ownerId,
            grantedByRole: "owner",
            createdAt: now,
          });
        }
      );
      return { id: farmId, name: input.name };
    }),
  current: protectedProcedure.handler(({ context }) => context.farm),

  /** The Manager tunes the Farm Parameters. Audited like any other write, with the values
   *  as they stood before, so a flag raised under an old tolerance stays explicable. */
  setParameters: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(parameters)
    .handler(async ({ context, input }) => {
      const changes: Partial<typeof farm.$inferInsert> = {};
      if (input.pinAutoLockMinutes !== undefined) {
        changes.pinAutoLockMinutes = input.pinAutoLockMinutes;
      }
      if (input.milkTolerancePercent !== undefined) {
        changes.milkTolerancePercent = input.milkTolerancePercent;
      }
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: async (tx) =>
            (await tx.query.farm.findFirst({
              where: { id: context.farm.id },
              columns: {
                pinAutoLockMinutes: true,
                milkTolerancePercent: true,
              },
            })) ?? null,
          after: changes,
        },
        (tx) => tx.update(farm).set(changes).where(eq(farm.id, context.farm.id))
      );
      return { ...context.farm, ...changes };
    }),
};
