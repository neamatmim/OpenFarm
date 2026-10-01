import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, lt } from "@OpenFarm/db/operators";
import { ALERT_KINDS, textMessage } from "@OpenFarm/db/schema/alert";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import type { AlertKind } from "@OpenFarm/domain";
import { goesByText } from "@OpenFarm/domain";

import type { Context } from "./context";
import type { RaisedAlert } from "./instances-store";
import { smsFor } from "./sms";

/** One notice worth a text message, whoever it was raised for in the app. */
interface Textable {
  kind: AlertKind;
  entityId: string;
  /** The facts it was raised with; its words are filled from them in each reader's language. */
  params: unknown;
}

/**
 * The distinct notices in a batch that go by text.
 *
 * One message about one thing: a notice reaches the app for every person it concerns, but one
 * Withdrawal ending is one thing to be texted about, not one per recipient.
 */
const worthTexting = (
  raised: { kind: RaisedAlert["kind"]; entityId: string; params: unknown }[]
): Textable[] => {
  const byThing = new Map<string, Textable>();
  for (const alert of raised) {
    const kind = alert.kind as AlertKind;
    if (!goesByText(kind)) {
      continue;
    }
    byThing.set(`${kind}:${alert.entityId}`, {
      kind,
      entityId: alert.entityId,
      params: alert.params,
    });
  }
  return [...byThing.values()];
};

/**
 * A message claimed before and not delivered — the gateway said no, or the server died before it asked — claimed
 * again the same way, by its row: its last try moved to now, so two sweeps cannot both send it.
 */
const claimAgain = async (
  context: Context,
  {
    userId,
    phone,
    notice,
    triedBefore,
    now,
  }: {
    userId: string;
    phone: string;
    notice: Textable;
    triedBefore: Date;
    now: Date;
  }
): Promise<{ id: string } | undefined> => {
  const [again] = await context.db
    .update(textMessage)
    .set({ sentAt: now, sentTo: phone })
    .where(
      and(
        eq(textMessage.userId, userId),
        eq(textMessage.kind, notice.kind),
        eq(textMessage.entityId, notice.entityId),
        eq(textMessage.delivered, false),
        lt(textMessage.sentAt, triedBefore)
      )
    )
    .returning({ id: textMessage.id });
  return again;
};

const tellThemBySms = async (
  context: Context & { farm: NonNullable<Context["farm"]> },
  notices: Textable[],
  /** Set when going back over what did not go: a message tried before this and not delivered is tried again. */
  { againIfTriedBefore }: { againIfTriedBefore?: Date } = {}
) => {
  const farmId = context.farm.id;
  // Whoever holds the two Roles the notification table names, and has a number written down.
  const roles = await context.db.query.roleAssignment.findMany({
    where: { farmId, role: { in: ["owner", "manager"] }, ...ACTIVE_ROLE },
    columns: { userId: true },
  });
  const reachable = await context.db.query.user.findMany({
    where: {
      id: { in: [...new Set(roles.map((row) => row.userId))] },
      phone: { isNotNull: true },
      disabledAt: { isNull: true },
    },
    columns: { id: true, phone: true, language: true },
  });
  const now = context.clock.now();
  let sent = 0;
  let missed = 0;
  let already = 0;
  for (const notice of notices) {
    for (const person of reachable) {
      const message = smsFor(notice.kind, notice.params, person);
      if (!(message && person.phone)) {
        continue;
      }
      // Claimed before it is sent: the row is the farm's record that this person was told about
      // this thing, and the unique index is what makes "already told" a fact rather than a
      // guess. Deliberately sequential — a handful of numbers, and a gateway that rate-limits
      // is happier for it.
      // oxlint-disable-next-line no-await-in-loop
      const [claimed] = await context.db
        .insert(textMessage)
        .values({
          id: uuidv7(now),
          farmId,
          kind: notice.kind,
          entityId: notice.entityId,
          userId: person.id,
          sentTo: person.phone,
          delivered: false,
          sentAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: textMessage.id });
      const mine =
        claimed ??
        (againIfTriedBefore
          ? // oxlint-disable-next-line no-await-in-loop
            await claimAgain(context, {
              userId: person.id,
              phone: person.phone,
              notice,
              triedBefore: againIfTriedBefore,
              now,
            })
          : undefined);
      if (!mine) {
        already += 1;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop
      const answer = await context.sms.send(person.phone, message);
      if (answer.delivered) {
        sent += 1;
      } else {
        missed += 1;
      }
      // oxlint-disable-next-line no-await-in-loop
      await context.db
        .update(textMessage)
        .set({ delivered: answer.delivered })
        .where(eq(textMessage.id, mine.id));
    }
  }
  return { sent, missed, already };
};

/**
 * Texts the two safety notices to the Owner and the Manager, on top of the push and the in-app
 * Alert.
 *
 * Them and nobody else, because the farm's notification table says so: these two cost money or
 * break a legal deadline if they are missed, and a push that does not arrive has cost nobody
 * anything — which is fine for the rest and not fine for these.
 *
 * Sent outside the transaction that raised the notices, like a push: a gateway is somebody
 * else's server, and a slow one must not hold a lock the whole shed is waiting on. Nothing here
 * can fail loudly either — a farm whose message did not go still has the Alert in the app, and a
 * throw would take the sweep that raised it down as well.
 *
 * Each message is written down before it is sent, which is what stops the same Withdrawal being
 * texted about twice when somebody new is told about it in the app, and what lets the farm show
 * it told the people it is supposed to tell.
 */
export const textTheSafetyAlerts = async (
  context: Context & { farm: NonNullable<Context["farm"]> },
  raised: RaisedAlert[]
): Promise<{ sent: number; missed: number; already: number }> => {
  const nothing = { sent: 0, missed: 0, already: 0 };
  const notices = worthTexting(raised);
  if (notices.length === 0) {
    return nothing;
  }
  try {
    return await tellThemBySms(context, notices);
  } catch {
    // The gateway, the roster or the database: none of them is a reason for the work that
    // raised the notice to fail. The Alert is in the app either way.
    return nothing;
  }
};

/** The two kinds the notification table sends by text. */
const TEXTED_KINDS = ALERT_KINDS.filter((kind) => goesByText(kind));

/** How long a safety notice is still worth a text: a day, after which the Withdrawal is over and the Vet has been. */
const TEXT_AGAIN_FOR_MS = 24 * 60 * 60 * 1000;

/** How long after a try that did not go before the next: three sweeps, not every one through a gateway's outage. */
const TRY_AGAIN_AFTER_MS = 15 * 60 * 1000;

/**
 * Sends again the safety texts that did not go. The notice is raised once, and the text sent once
 * straight after; a gateway that was down that minute, or a server that died between the two, would
 * otherwise leave the Owner and the Manager with nothing in their pocket about a Withdrawal ending or
 * a notifiable disease. So the sweep goes back over the last day's, and texts whoever was not texted
 * — never twice anybody who was.
 *
 * Quiet like the first try: nothing here is a reason for the sweep to fail.
 */
export const textAgainWhatDidNotGo = async (
  context: Context & { farm: NonNullable<Context["farm"]> }
): Promise<{ sent: number; missed: number; already: number }> => {
  const nothing = { sent: 0, missed: 0, already: 0 };
  try {
    const now = context.clock.now();
    const recent = await context.db.query.alert.findMany({
      where: {
        farmId: context.farm.id,
        kind: { in: TEXTED_KINDS },
        createdAt: { gte: new Date(now.getTime() - TEXT_AGAIN_FOR_MS) },
      },
      columns: { kind: true, entityId: true, params: true },
    });
    const notices = worthTexting(recent);
    if (notices.length === 0) {
      return nothing;
    }
    return await tellThemBySms(context, notices, {
      againIfTriedBefore: new Date(now.getTime() - TRY_AGAIN_AFTER_MS),
    });
  } catch {
    return nothing;
  }
};
