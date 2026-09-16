import type { AlertKind } from "@OpenFarm/domain";
import { isQuiet, wakesTheFarm } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import { farmDayOf, minuteOfFarmDay } from "./instances-store";
import type { RaisedAlert } from "./instances-store";
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
  const toSend = asleep
    ? raised.filter((alert) => wakesTheFarm(alert.kind as AlertKind))
    : raised;
  if (toSend.length === 0) {
    return nothing;
  }
  try {
    // Its own transaction, opened here rather than by the audited helper: there is no one
    // change this is about. Each Alert gets its own trail entry below, because what became
    // of telling one person about one thing belongs on that thing and not in a total.
    return await context.db.transaction((tx) =>
      pushAlerts(
        tx,
        context.push,
        context.farm.id,
        toSend,
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
      )
    );
  } catch (error) {
    // A push service that will not answer is not something to put in front of the person
    // who was going to be told. The Alert is already theirs to read.
    if (error instanceof ORPCError) {
      throw error;
    }
    return nothing;
  }
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
  const post = await context.db.transaction((tx) =>
    claimTheDigest(tx, context.farm.id, now, upTo)
  );
  if (post.length === 0) {
    // Nothing to carry is not an event: no transaction, no trail entry.
    return nothing;
  }
  return await context.db.transaction(async (tx) => {
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
