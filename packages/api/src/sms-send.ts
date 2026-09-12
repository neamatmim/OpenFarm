import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import { goesByText } from "@OpenFarm/domain";
import type { MessageParams } from "@OpenFarm/i18n";

import type { Context } from "./context";
import type { RaisedAlert } from "./instances-store";
import { smsFor } from "./sms";

/** One notice worth a text message, whoever it was raised for in the app. */
interface Worth {
  kind: RaisedAlert["kind"];
  entityId: string;
  params: MessageParams;
}

/** The distinct notices in a batch that go by text — one message about one thing, however many
 *  people were told about it in the app. */
const worthTexting = (raised: RaisedAlert[]): Worth[] => {
  const byThing = new Map<string, Worth>();
  for (const alert of raised) {
    if (!goesByText(alert.kind as never)) {
      continue;
    }
    byThing.set(`${alert.kind}:${alert.entityId}`, {
      kind: alert.kind,
      entityId: alert.entityId,
      params: alert.params as MessageParams,
    });
  }
  return [...byThing.values()];
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
 * else's server, and a slow one must not hold a lock the whole shed is waiting on. A number
 * nobody has written down simply gets no message.
 */
export const textTheSafetyAlerts = async (
  context: Context & { farm: NonNullable<Context["farm"]> },
  raised: RaisedAlert[]
): Promise<{ sent: number; missed: number }> => {
  const notices = worthTexting(raised);
  if (notices.length === 0) {
    return { sent: 0, missed: 0 };
  }
  // Whoever holds the two Roles the table names, and has a number written down.
  const roles = await context.db.query.roleAssignment.findMany({
    where: {
      farmId: context.farm.id,
      role: { in: ["owner", "manager"] },
      ...ACTIVE_ROLE,
    },
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
  let sent = 0;
  let missed = 0;
  for (const notice of notices) {
    for (const person of reachable) {
      const message = smsFor(notice.kind as never, notice.params, person);
      if (!(message && person.phone)) {
        continue;
      }
      // Deliberately sequential: a handful of numbers, and a gateway that rate-limits is
      // happier for it.
      // oxlint-disable-next-line no-await-in-loop
      const answer = await context.sms.send(person.phone, message);
      if (answer.delivered) {
        sent += 1;
      } else {
        missed += 1;
      }
    }
  }
  return { sent, missed };
};
