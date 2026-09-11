import { and, eq, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { farm } from "@OpenFarm/db/schema/farm";
import { pushSubscription } from "@OpenFarm/db/schema/push";
import { env } from "@OpenFarm/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { findPendingNotices, raiseLateAlerts } from "../instances-store";
import { rememberListener, tellListeners } from "../push-store";
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
      let pushed: { sent: number; gone: number; missed: number } = {
        sent: 0,
        gone: 0,
        missed: 0,
      };
      const pending = await findPendingNotices(context.db, context.farm, now);
      // A sweep with nothing to say is not an event, and opens no transaction: everyone
      // calls this on opening the app, and in steady state there is nothing new to say.
      // The watermark stays where it is — a window with nothing in it costs nothing to
      // look at again.
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
              // What left the farm, so "we told them" is something the trail can show.
              pushed,
            }),
        },
        async (tx) => {
          const swept = await raiseLateAlerts(
            tx,
            context.farm.id,
            pending,
            now
          );
          // Remembered inside the same transaction as the notices: a watermark that moved
          // on without them would step over work nobody was ever told about.
          await tx
            .update(farm)
            .set({ alertsSweptFrom: pending.sweptFrom })
            .where(eq(farm.id, context.farm.id));
          // The tap on the shoulder, in the same transaction as the Alert it is about.
          // Every failure is swallowed inside: the in-app Alert is the record, and a push
          // that did not arrive has cost nobody anything.
          const told = await tellListeners(
            tx,
            context.push,
            context.farm.id,
            swept.raised,
            now
          );
          pushed = told;
          return { ...swept, told };
        }
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

  /** What this farm's browsers need to speak to it, and nothing secret: the public half of
   *  the farm's keys, or nothing when the farm does not push at all. */
  pushKey: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(() => ({ key: env.VAPID_PUBLIC_KEY ?? null })),

  /** This browser agrees to be told. Per browser, not per person: a Manager with a phone and
   *  an office machine has two, and an Alert should reach both. */
  listen: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({
        endpoint: z.url().max(1000),
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(200),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "push_subscription",
          entityId: input.endpoint,
          action: "create",
          after: { userId: context.actor.id },
        },
        (tx) =>
          rememberListener(
            tx,
            {
              farmId: context.farm.id,
              userId: context.actor.id,
              // A Shed Phone's voice goes when the phone does (ADR 0003).
              deviceId: context.device?.id ?? null,
              ...input,
            },
            now
          )
      );
      return { listening: true };
    }),

  /** This browser would rather not be told. The row stays, revoked: who was told what, and
   *  who stopped being told, is part of the farm's record. */
  stopListening: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ endpoint: z.url().max(1000) }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "push_subscription",
          entityId: input.endpoint,
          action: "update",
          after: { revokedAt: now.toISOString() },
        },
        async (tx) => {
          const [row] = await tx
            .update(pushSubscription)
            .set({ revokedAt: now })
            .where(
              and(
                eq(pushSubscription.endpoint, input.endpoint),
                eq(pushSubscription.farmId, context.farm.id),
                // Your own browser, not somebody else's.
                eq(pushSubscription.userId, context.actor.id),
                isNull(pushSubscription.revokedAt)
              )
            )
            .returning({ id: pushSubscription.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { listening: false };
    }),

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
