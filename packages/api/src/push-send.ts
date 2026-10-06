import { and, inArray, isNull } from "@OpenFarm/db/operators";
import { alert as alertRow } from "@OpenFarm/db/schema/alert";
import type { AlertKind } from "@OpenFarm/domain";
import {
  ALERT_KINDS,
  farmDayOf,
  isQuiet,
  wakesTheFarm,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import { minuteOfFarmDay } from "./instances-store";
import type { RaisedAlert } from "./instances-store";
import { travelsByPush } from "./push";
import type { Told } from "./push-store";
import { carryTheDigest, claimTheDigest, pushAlerts } from "./push-store";

/**
 * Sends the tap on the shoulder, after the Alerts it is about are safely the farm's record.
 *
 * Deliberately its own transaction, and deliberately not the one that raised them. A push is
 * a call to somebody else's server: holding the Alert transaction open across it would keep
 * a lock that every phone in the shed is waiting on, and a push sent before that transaction
 * committed could buzz a pocket about work the farm then rolled back.
 *
 * The push service cannot fail loudly. A service that is down, keys that are wrong, a phone that has been
 * wiped: each is swallowed where the browser is told, counted as missed, and the person still opens the app to
 * the same list. Callers lean on that — a Withdrawal ending and a notifiable Diagnosis are texted on the line
 * after this one, and the text exists because a push may not arrive.
 *
 * What is not swallowed is the farm refusing itself: an ORPCError from the trail written here is the farm's
 * own word about the request, and belongs to whoever asked.
 */
export const pushRaised = async (
  context: Context & {
    farm: NonNullable<Context["farm"]>;
  },
  raised: RaisedAlert[],
  now: Date
): Promise<{ sent: number; gone: number; missed: number }> => {
  const nothing = { sent: 0, gone: 0, missed: 0 };
  // Quiet hours are the farm's, and only a safety notice may cross them. Everything else still
  // reaches the app at once and is read when somebody opens it: the quiet is on the phone, not
  // on the record.
  const asleep = isQuiet(minuteOfFarmDay(now), {
    from: context.farm.quietFrom,
    until: context.farm.quietUntil,
  });
  // Only what goes to a pocket at once: a digest's kinds wait for the post, and are never claimed here.
  const toSend = (
    asleep
      ? raised.filter((alert) => wakesTheFarm(alert.kind as AlertKind))
      : raised
  ).filter((alert) => travelsByPush(alert.kind));
  if (toSend.length === 0) {
    return nothing;
  }
  try {
    // Its own transaction, opened here rather than by the audited helper: there is no one
    // change this is about. Each Alert gets its own trail entry below, because what became
    // of telling one person about one thing belongs on that thing and not in a total.
    return await context.db.transaction(async (tx) => {
      // Carried by this push, and by no other: one held over the night and carried in the morning is carried once, and
      // two sweeps at once do not both buzz the same pocket.
      const claimed = await tx
        .update(alertRow)
        .set({ carriedAt: now })
        .where(
          and(
            inArray(
              alertRow.id,
              toSend.map((one) => one.id)
            ),
            isNull(alertRow.carriedAt)
          )
        )
        .returning({ id: alertRow.id });
      const ours = new Set(claimed.map((one) => one.id));
      return await pushAlerts(
        tx,
        context.push,
        context.farm.id,
        toSend.filter((one) => ours.has(one.id)),
        now,
        async (inner, alert, told) => {
          await audited(context).recordEvent(
            inner,
            {
              entity: "alert",
              entityId: alert.id,
              action: "update",
              after: { ...told, kind: alert.kind },
            },
            { receivedAt: now }
          );
        }
      );
    });
  } catch (error) {
    // A push service that will not answer is not something to put in front of the person
    // who was going to be told. The Alert is already theirs to read.
    if (error instanceof ORPCError) {
      throw error;
    }
    return nothing;
  }
};

/** The kinds a push carries at once. */
const PUSHED_KINDS = ALERT_KINDS.filter((kind) => travelsByPush(kind));

/** How far back a notice that should have gone at once and has not is still worth a pocket: a day. Older, it is in the
 *  app already and a buzz about it would be news of nothing. */
const STILL_NEWS_MS = 24 * 60 * 60 * 1000;

/**
 * Pushes what should have gone at once and has not: what the quiet hours held — a death at eleven at night reaches the
 * Owner when the farm wakes, as the glossary says — and anything raised where no push followed it. Only while the farm
 * is awake, and only what is a day old or less, each once.
 */
export const carryWhatWasHeld = async (
  context: Context & { farm: NonNullable<Context["farm"]> },
  now: Date
) => {
  const asleep = isQuiet(minuteOfFarmDay(now), {
    from: context.farm.quietFrom,
    until: context.farm.quietUntil,
  });
  if (asleep) {
    return;
  }
  const held = await context.db.query.alert.findMany({
    where: {
      farmId: context.farm.id,
      kind: { in: PUSHED_KINDS },
      carriedAt: { isNull: true },
      dismissedAt: { isNull: true },
      createdAt: { gte: new Date(now.getTime() - STILL_NEWS_MS) },
    },
    columns: {
      id: true,
      userId: true,
      kind: true,
      entity: true,
      entityId: true,
      params: true,
    },
  });
  if (held.length === 0) {
    return;
  }
  await pushRaised(
    context,
    held.map((one) => ({
      ...one,
      params: (one.params ?? {}) as Record<string, unknown>,
    })),
    now
  );
};

/**
 * Carries the farm's post: claims it in one transaction, tells the browsers outside that
 * one, and records what became of it.
 *
 * Here rather than in the router for the same reason `pushRaised` is: a router opens no
 * transactions, and a push must not happen inside one.
 */
export const carryThePost = async (
  context: Context & {
    farm: NonNullable<Context["farm"]>;
  },
  now: Date,
  upTo: Date
): Promise<{ people: number; told: Told }> => {
  const nothing = { people: 0, told: { sent: 0, gone: 0, missed: 0 } };
  // Claimed and carried in one transaction: claimed apart and committed before it went, a post the server died carrying
  // was marked carried and never pushed. Now an unfinished carrying is claimed again the next time — at least once,
  // never lost. Nothing to carry is still no trail entry.
  return await context.db.transaction(async (tx) => {
    const post = await claimTheDigest(tx, context.farm.id, now, upTo);
    if (post.length === 0) {
      return nothing;
    }
    const carried = await carryTheDigest(
      tx,
      context.push,
      context.farm.id,
      post,
      now
    );
    await audited(context).recordEvent(
      tx,
      {
        entity: "alert",
        entityId: `digest:${farmDayOf(now)}`,
        action: "update",
        after: {
          people: carried.people,
          ...carried.told,
          upTo: upTo.toISOString(),
        },
      },
      { receivedAt: now }
    );
    return carried;
  });
};
