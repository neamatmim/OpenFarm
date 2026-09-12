import { and, eq } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { farm } from "@OpenFarm/db/schema/farm";
import { isQuiet } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  anyUntold,
  raiseWithdrawalAlerts,
  withdrawalsEndingSoon,
} from "../health-store";
import { protectedProcedure } from "../index";
import {
  findPendingNotices,
  minuteOfFarmDay,
  postDueAt,
  raiseLateAlerts,
} from "../instances-store";
import { carryThePost, pushRaised } from "../push-send";
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

/**
 * The other half of the sweep: cows coming off a Withdrawal within the day. Its own audited
 * write, keyed on an animal rather than on an Instance, because no work raised it — the clock
 * did, against a date a Treatment set.
 */
type Sweeping = Parameters<typeof pushRaised>[0];

const tellAboutWithdrawals = async (context: Sweeping, now: Date) => {
  const ending = await withdrawalsEndingSoon(context.db, context.farm.id, now);
  const [soonest] = ending;
  // Nothing coming off, or everyone has already been told: no transaction, no trail entry.
  if (!soonest || !(await anyUntold(context.db, context.farm.id, ending))) {
    return;
  }
  const raised = await audited(context).write(
    {
      entity: "animal",
      entityId: soonest.id,
      action: "update",
      after: () =>
        Promise.resolve({ endingSoon: ending.map((beast) => beast.tagNumber) }),
    },
    (tx) => raiseWithdrawalAlerts(tx, context.farm.id, ending, now)
  );
  await pushRaised(context, raised, now);
};

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
      // Two halves that have nothing to do with each other: work that went late, and cows
      // coming off a Withdrawal. Told about first, because late work having nothing to say is
      // the steady state and must not silence the other half.
      await tellAboutWithdrawals(context, now);
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
      const swept = await audited(context).write(
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
        async (tx) => {
          const raised = await raiseLateAlerts(
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
          return raised;
        }
      );
      // The tap on the shoulder goes out after the Alerts are safely the farm's record, and
      // never inside the transaction that made them: a push is a call to somebody else's
      // server, and a hung one would hold a lock every phone in the shed is waiting on.
      await pushRaised(context, swept.raised, now);
      return { overdue: swept.overdue, escalated: swept.escalated };
    }),

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
    .handler(async ({ context }) => {
      const nothing = { people: 0, told: { sent: 0, gone: 0, missed: 0 } };
      const now = context.clock.now();
      const quiet = {
        from: context.farm.quietFrom,
        until: context.farm.quietUntil,
      };
      // Not only "has a carrying moment passed" but "is the farm awake": somebody opening
      // the app at half past midnight must not set every phone on the farm buzzing.
      if (isQuiet(minuteOfFarmDay(now), quiet)) {
        return nothing;
      }
      const upTo = postDueAt(now, context.farm.digestTimes, quiet);
      if (!upTo) {
        return nothing;
      }
      return await carryThePost(context, now, upTo);
    }),

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
