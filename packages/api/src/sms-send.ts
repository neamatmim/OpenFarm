import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { textMessage } from "@OpenFarm/db/schema/alert";
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
const worthTexting = (raised: RaisedAlert[]): Textable[] => {
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

const tellThemBySms = async (
  context: Context & { farm: NonNullable<Context["farm"]> },
  notices: Textable[]
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
      if (!claimed) {
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
        .where(eq(textMessage.id, claimed.id));
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
