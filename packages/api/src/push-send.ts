import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import { farmDayOf } from "./instances-store";
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
 * Nothing here can fail loudly. The in-app Alert is the record; if the push service is down,
 * the keys are wrong, or the phone has been wiped, the person still opens the app to the
 * same list — and hears about none of it from us.
 */
export const pushRaised = async (
  context: Context & {
    farm: NonNullable<Context["farm"]>;
    actor: NonNullable<Context["actor"]>;
  },
  raised: RaisedAlert[],
  now: Date
): Promise<{ sent: number; gone: number; missed: number }> => {
  const nothing = { sent: 0, gone: 0, missed: 0 };
  if (raised.length === 0) {
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
        raised,
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
    actor: NonNullable<Context["actor"]>;
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
