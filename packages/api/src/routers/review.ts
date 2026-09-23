import { and, eq, isNull } from "@OpenFarm/db/operators";
import { needsReview } from "@OpenFarm/db/schema/review";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { withTheirWork } from "../review-store";
import { requireRole } from "../roles";

/** How much of the queue a screen is handed at once. */
const QUEUE_LIMIT = 100;

export const reviewRouter = {
  /** What the system could not put right on its own, oldest first — the things that have
   *  been waiting longest are the ones most likely to have been forgotten. */
  open: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) =>
      withTheirWork(
        context.db,
        context.farm.id,
        await context.db.query.needsReview.findMany({
          where: { farmId: context.farm.id, resolvedAt: { isNull: true } },
          // Narrowed: the queue needs the Correction's reason and who made it, not the
          // before-and-after snapshots of the entry it changed.
          with: {
            raisedBy: {
              columns: {
                id: true,
                action: true,
                reason: true,
                actorId: true,
                roleUsed: true,
                recordedAt: true,
              },
            },
          },
          orderBy: { raisedAt: "asc" },
          limit: QUEUE_LIMIT,
        })
      )
    ),

  /** Closing one is a judgement, so it is recorded as one: what was decided, by whom, under
   *  which Role. Nothing is removed. */
  resolve: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string(),
        resolution: z.string().trim().min(1).max(400),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "needs_review",
          entityId: input.id,
          action: "update",
          reason: input.resolution,
          after: {
            resolvedAt: now.toISOString(),
            resolvedBy: context.actor.id,
          },
        },
        async (tx) => {
          const [row] = await tx
            .update(needsReview)
            .set({
              resolvedAt: now,
              resolvedBy: context.actor.id,
              resolution: input.resolution,
            })
            .where(
              and(
                eq(needsReview.id, input.id),
                eq(needsReview.farmId, context.farm.id),
                // Only an open one: resolving twice would overwrite the first person's
                // judgement with the second's.
                isNull(needsReview.resolvedAt)
              )
            )
            .returning({ id: needsReview.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "That is not waiting to be looked at",
            });
          }
        }
      );
      return { id: input.id, resolved: true };
    }),
};
