import { and, eq } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";
import { thePost, theSweep } from "../the-day-turns";

/** How many notices a phone is handed at once. More than this and the list is not the
 *  problem the farm has. */
const INBOX_LIMIT = 50;

export const alertsRouter = {
  /**
   * Raises the Alerts the clock has earned. Idempotent, so the phone and the office can both
   * call it on open and neither piles up duplicates; a scheduled job replaces that later,
   * exactly as it will for ensureDue.
   */
  sweep: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) => theSweep(context)),

  /**
   * What this person is being told, newest first. Theirs alone — an Alert is personal.
   * Narrowing to one thing answers the question a screen showing that thing actually has:
   * is there anything waiting about this piece of work, and what does it say?
   */
  /**
   * Carries the day's quieter notices — one push each, naming what is in it.
   *
   * Called wherever the app is opened, like the sweep, and safe to call as often as anybody
   * likes: the post is claimed in one statement, so two phones opening at six do not both
   * carry it. A carrying moment inside quiet hours waits for the farm to wake, and so does a
   * call made in the small hours — a batch of things that could wait is exactly what quiet
   * hours are for.
   */
  digest: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) => thePost(context)),

  mine: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(
      z
        .object({
          entityId: z.string().optional(),
          /** Every notice about one thing that is told about more than once, as a Money Event is each
           *  time it starts waiting. */
          about: z.string().min(1).optional(),
        })
        .default({})
    )
    .handler(({ context, input }) =>
      context.db.query.alert.findMany({
        where: {
          farmId: context.farm.id,
          userId: context.actor.id,
          dismissedAt: { isNull: true },
          ...(input.entityId ? { entityId: input.entityId } : {}),
          ...(input.about ? { entityId: { like: `${input.about}:%` } } : {}),
        },
        orderBy: { createdAt: "desc", id: "desc" },
        limit: INBOX_LIMIT,
      })
    ),

  /**
   * Dismissing is the reader saying they have seen it; the row stays. Audited like any other
   * write — and worth auditing on its own account: that the Manager was told the milking was
   * late, and acknowledged it, is exactly the kind of thing this system exists to be able to
   * show afterwards.
   */
  dismiss: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "alert",
          entityId: input.id,
          action: "update",
          after: { dismissedAt: now.toISOString() },
        },
        async (tx) => {
          const [row] = await tx
            .update(alert)
            .set({ dismissedAt: now })
            .where(
              and(
                eq(alert.id, input.id),
                // Only your own: nobody clears someone else's list.
                eq(alert.userId, context.actor.id),
                eq(alert.farmId, context.farm.id)
              )
            )
            .returning({ id: alert.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { id: input.id, dismissed: true };
    }),
};
