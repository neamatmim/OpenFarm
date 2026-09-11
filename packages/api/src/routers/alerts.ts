import { and, eq } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { findPendingNotices, raiseLateAlerts } from "../instances-store";
import { requireRole } from "../roles";

/** How many notices a phone is handed at once. More than this and the list is not the
 *  problem the farm has. */
const INBOX_LIMIT = 50;

/** The Instance the sweep's Audit Event is keyed on: the first it has something to say
 *  about, with the rest named in the event's payload. */
const first = (pending: {
  overdue: { id: string }[];
  escalated: { id: string }[];
}): string => pending.overdue[0]?.id ?? pending.escalated[0]?.id ?? "";

export const alertsRouter = {
  /**
   * Raises the Alerts the clock has earned. Idempotent, so the phone and the office can both
   * call it on open and neither piles up duplicates; a scheduled job replaces that later,
   * exactly as it will for ensureDue.
   */
  sweep: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const pending = await findPendingNotices(context.db, context.farm, now);
      // A sweep with nothing to say is not an event, and opens no transaction: everyone
      // calls this on opening the app, and in steady state there is nothing new to say.
      if (pending.overdue.length + pending.escalated.length === 0) {
        return { overdue: 0, escalated: 0 };
      }
      // Audited against each Instance the notice is about, not against the sweep: an
      // entityId no row carries is a trail entry nothing can find its way back to. Reading
      // an Instance's history now shows that it went late and who was told.
      return await audited(context).write(
        {
          entity: "sop_instance",
          entityId: first(pending),
          action: "update",
          after: () =>
            Promise.resolve({
              overdue: pending.overdue.map((row) => row.id),
              escalated: pending.escalated.map((row) => row.id),
            }),
        },
        (tx) => raiseLateAlerts(tx, context.farm.id, pending, now)
      );
    }),

  /**
   * What this person is being told, newest first. Theirs alone — an Alert is personal.
   * Narrowing to one thing answers the question a screen showing that thing actually has:
   * is there anything waiting about this piece of work, and what does it say?
   */
  mine: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ entityId: z.string().optional() }).default({}))
    .handler(({ context, input }) =>
      context.db.query.alert.findMany({
        where: {
          farmId: context.farm.id,
          userId: context.actor.id,
          dismissedAt: { isNull: true },
          ...(input.entityId ? { entityId: input.entityId } : {}),
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
    .use(requireRole("owner", "manager", "staff", "vet"))
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
