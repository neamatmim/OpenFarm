import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { pushSubscription } from "@OpenFarm/db/schema/push";
import { waitsForTheDigest } from "@OpenFarm/domain";
import { translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { PushMessage, PushTarget, PushTransport } from "./push";
import { messageFor, travelsByPush } from "./push";

/**
 * Every browser still listening for these people, with the language its owner reads in.
 *
 * A subscription on a Shed Phone that has been revoked is not listening, whatever its own
 * row says: the phone is gone, and a handset lost in a yard should not keep being told the
 * farm's business (ADR 0003). Revoking the phone revokes them too; this is the second lock
 * on the same door.
 */
export const listenersFor = async (
  tx: Tx,
  farmId: string,
  userIds: readonly string[]
) => {
  if (userIds.length === 0) {
    return [];
  }
  const listening = await tx.query.pushSubscription.findMany({
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
    with: {
      owner: { columns: { language: true } },
      device: { columns: { revokedAt: true } },
    },
  });
  return listening.filter((row) => !row.device?.revokedAt);
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
export interface Tellable {
  /** The Alert row, so what became of telling somebody is recorded against it. */
  id: string;
  kind: string;
  entity: string;
  entityId: string;
  params: unknown;
  userId: string;
}

export const pushAlerts = async (
  tx: Tx,
  transport: PushTransport,
  farmId: string,
  alerts: Tellable[],
  now: Date,
  /** Called for each Alert whose browsers have been tried, so the trail can say the farm
   *  tried. Given the transaction, because the record of trying belongs with it. */
  record?: (
    tx: Tx,
    alert: Tellable,
    told: { sent: number; gone: number; missed: number }
  ) => Promise<void>
): Promise<Told> => {
  const listeners = await listenersFor(
    tx,
    farmId,
    alerts.map((one) => one.userId)
  );
  const byUser = new Map<string, typeof listeners>();
  for (const listener of listeners) {
    byUser.set(listener.userId, [
      ...(byUser.get(listener.userId) ?? []),
      listener,
    ]);
  }
  const told: Told = { sent: 0, gone: 0, missed: 0 };
  for (const notice of alerts) {
    if (!travelsByPush(notice.kind)) {
      // The notification table puts this one in a digest, not in somebody's pocket.
      continue;
    }
    const forThis: Told = { sent: 0, gone: 0, missed: 0 };
    for (const listener of byUser.get(notice.userId) ?? []) {
      const message: PushMessage = messageFor(notice, listener.owner.language);
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
        forThis.gone += 1;
        // oxlint-disable-next-line no-await-in-loop
        await stopTelling(tx, listener.id, now);
      } else if (answer.delivered) {
        forThis.sent += 1;
      } else {
        forThis.missed += 1;
      }
    }
    told.sent += forThis.sent;
    told.gone += forThis.gone;
    told.missed += forThis.missed;
    if (record && forThis.sent + forThis.gone + forThis.missed > 0) {
      // oxlint-disable-next-line no-await-in-loop
      await record(tx, notice, forThis);
    }
  }
  return told;
};

/**
 * Records one browser as willing to be told.
 *
 * The endpoint is the browser's own name for itself, so subscribing twice is one
 * subscription — but only ever this person's own. A browser somebody else registered is
 * somebody else's: rewriting it would silently stop them being told, and an endpoint is not
 * a secret worth resting that on.
 */
export const rememberPushBrowser = async (
  tx: Tx,
  browser: {
    farmId: string;
    userId: string;
    deviceId: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  now: Date
): Promise<string> => {
  const standing = await tx.query.pushSubscription.findFirst({
    where: { farmId: browser.farmId, endpoint: browser.endpoint },
    columns: { id: true, userId: true },
  });
  if (standing && standing.userId !== browser.userId) {
    throw new ORPCError("CONFLICT", {
      message: "That browser is already listening for somebody else",
    });
  }
  const id = standing?.id ?? uuidv7(now);
  await tx
    .insert(pushSubscription)
    .values({ id, ...browser, createdAt: now })
    .onConflictDoUpdate({
      target: [pushSubscription.farmId, pushSubscription.endpoint],
      set: {
        deviceId: browser.deviceId,
        p256dh: browser.p256dh,
        auth: browser.auth,
        // Subscribing again is asking to be told again.
        revokedAt: null,
      },
    });
  return id;
};

/** A Shed Phone that has been revoked stops being told, whatever its browsers agreed to. */
export const silenceDevice = (tx: Tx, deviceId: string, now: Date) =>
  tx
    .update(pushSubscription)
    .set({ revokedAt: now })
    .where(
      and(
        eq(pushSubscription.deviceId, deviceId),
        isNull(pushSubscription.revokedAt)
      )
    );

/**
 * Carries the day's quieter notices to the people waiting for them: one push each, naming
 * what is in it, and a stamp on every notice so tomorrow's digest does not carry it again.
 *
 * An empty digest is not sent. A farm whose phone buzzes to say nothing happened is a farm
 * that stops reading the ones that say something did.
 */
export const carryTheDigest = async (
  tx: Tx,
  transport: PushTransport,
  farmId: string,
  now: Date,
  /** Everything raised before this goes now; everything since waits for the next moment.
   *  That is what makes this a digest rather than a running commentary. */
  upTo: Date
): Promise<{ people: number; told: Told }> => {
  const waiting = await tx.query.alert.findMany({
    where: {
      farmId,
      carriedAt: { isNull: true },
      dismissedAt: { isNull: true },
      createdAt: { lte: upTo },
    },
    orderBy: { createdAt: "asc" },
    columns: { id: true, userId: true, kind: true, params: true },
  });
  const forEachPerson = new Map<string, typeof waiting>();
  for (const notice of waiting) {
    if (!waitsForTheDigest(notice.kind)) {
      continue;
    }
    forEachPerson.set(notice.userId, [
      ...(forEachPerson.get(notice.userId) ?? []),
      notice,
    ]);
  }
  if (forEachPerson.size === 0) {
    return { people: 0, told: { sent: 0, gone: 0, missed: 0 } };
  }

  const listeners = await listenersFor(tx, farmId, [...forEachPerson.keys()]);
  const told: Told = { sent: 0, gone: 0, missed: 0 };
  for (const [userId, notices] of forEachPerson) {
    const theirs = listeners.filter((listener) => listener.userId === userId);
    for (const listener of theirs) {
      const message: PushMessage = {
        title: translate(listener.owner.language, "push.digestTitle"),
        body: translate(listener.owner.language, "push.digestBody", {
          count: notices.length,
        }),
        url: "/today",
        // One digest replaces the last one rather than stacking: a phone showing three
        // evenings of them tells nobody anything.
        tag: `digest:${userId}`,
        lang: listener.owner.language,
      };
      // Sequential on purpose: a farm has a handful of browsers, and a push service is
      // happier with a queue than with a burst.
      // oxlint-disable-next-line no-await-in-loop
      const answer = await transport
        .send(
          {
            endpoint: listener.endpoint,
            keys: { p256dh: listener.p256dh, auth: listener.auth },
          },
          message
        )
        .catch(() => ({ delivered: false, gone: false }));
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
    // Stamped whether or not a push got through: the notices are in the app either way, and
    // a digest that retries for ever would carry the same fortnight every evening.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(alert)
      .set({ carriedAt: now })
      .where(
        inArray(
          alert.id,
          notices.map((notice) => notice.id)
        )
      );
  }
  return { people: forEachPerson.size, told };
};
