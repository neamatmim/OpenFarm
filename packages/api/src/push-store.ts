import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { pushSubscription } from "@OpenFarm/db/schema/push";

import type { Tx } from "./audit";
import type { PushMessage, PushTarget, PushTransport } from "./push";
import { messageFor } from "./push";

/** Every browser still listening for these people, with the language its owner reads in. */
export const listenersFor = async (
  tx: Tx,
  farmId: string,
  userIds: readonly string[]
) => {
  if (userIds.length === 0) {
    return [];
  }
  return await tx.query.pushSubscription.findMany({
    where: {
      farmId,
      userId: { in: [...new Set(userIds)] },
      revokedAt: { isNull: true },
    },
    columns: {
      id: true,
      userId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
    with: { owner: { columns: { language: true } } },
  });
};

/** A browser the push service says is gone stops being told. Kept rather than deleted: who
 *  was told what, and who stopped being told, is part of the farm's record. */
export const stopTelling = (tx: Tx, id: string, now: Date) =>
  tx
    .update(pushSubscription)
    .set({ revokedAt: now })
    .where(
      and(eq(pushSubscription.id, id), isNull(pushSubscription.revokedAt))
    );

export interface Told {
  sent: number;
  gone: number;
  /** Browsers that could not be reached this time. The Alert is still in the app, which is
   *  the record; a push that did not arrive has cost nobody anything. */
  missed: number;
}

/**
 * Tells the browsers that are listening. Every failure is swallowed on purpose: the in-app
 * Alert is the farm's record, and push is the tap on the shoulder. A push service that is
 * down, a phone that has been wiped, a browser that has forgotten its keys — none of those
 * are things to put in front of the person who was going to be told.
 */
export const tellListeners = async (
  tx: Tx,
  transport: PushTransport,
  farmId: string,
  alerts: {
    kind: string;
    entity: string;
    entityId: string;
    params: unknown;
    userId: string;
  }[],
  now: Date
): Promise<Told> => {
  const listeners = await listenersFor(
    tx,
    farmId,
    alerts.map((alert) => alert.userId)
  );
  const byUser = new Map<string, typeof listeners>();
  for (const listener of listeners) {
    byUser.set(listener.userId, [
      ...(byUser.get(listener.userId) ?? []),
      listener,
    ]);
  }
  const told: Told = { sent: 0, gone: 0, missed: 0 };
  for (const alert of alerts) {
    for (const listener of byUser.get(alert.userId) ?? []) {
      const message: PushMessage = messageFor(alert, listener.owner.language);
      const target: PushTarget = {
        endpoint: listener.endpoint,
        keys: { p256dh: listener.p256dh, auth: listener.auth },
      };
      // Sequential on purpose: a farm has a handful of browsers, and a push service is
      // happier with a queue than with a burst.
      // oxlint-disable-next-line no-await-in-loop
      const answer = await transport.send(target, message).catch(() => ({
        delivered: false,
        gone: false,
      }));
      if (answer.gone) {
        told.gone += 1;
        // oxlint-disable-next-line no-await-in-loop
        await stopTelling(tx, listener.id, now);
      } else if (answer.delivered) {
        told.sent += 1;
      } else {
        told.missed += 1;
      }
    }
  }
  return told;
};

/** Records one browser as willing to be told. The endpoint is the browser's own name for
 *  itself, so subscribing twice is one subscription. */
export const rememberListener = async (
  tx: Tx,
  listener: {
    farmId: string;
    userId: string;
    deviceId: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  now: Date
): Promise<void> => {
  await tx
    .insert(pushSubscription)
    .values({ id: uuidv7(now), ...listener, createdAt: now })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: listener.userId,
        deviceId: listener.deviceId,
        p256dh: listener.p256dh,
        auth: listener.auth,
        // Subscribing again is asking to be told again.
        revokedAt: null,
      },
    });
};
