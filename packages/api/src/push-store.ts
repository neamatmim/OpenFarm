import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull, lte } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { pushSubscription } from "@OpenFarm/db/schema/push";
import type { AlertKind } from "@OpenFarm/domain";
import { translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { PushMessage, PushTarget, PushTransport } from "./push";
import { DIGESTIBLE, digestWording, messageFor, travelsByPush } from "./push";

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

/** Tells one browser one thing, and stops telling it when the browser says it is gone. */
const tellOneBrowser = async (
  tx: Tx,
  transport: PushTransport,
  listener: { id: string; endpoint: string; p256dh: string; auth: string },
  message: PushMessage,
  tally: Told,
  now: Date
): Promise<void> => {
  const target: PushTarget = {
    endpoint: listener.endpoint,
    keys: { p256dh: listener.p256dh, auth: listener.auth },
  };
  const answer = await transport
    .send(target, message)
    .catch(() => ({ delivered: false, gone: false }));
  if (answer.gone) {
    tally.gone += 1;
    await stopTelling(tx, listener.id, now);
  } else if (answer.delivered) {
    tally.sent += 1;
  } else {
    tally.missed += 1;
  }
};

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
      // Sequential on purpose: a farm has a handful of browsers, and a push service is
      // happier with a queue than with a burst.
      // oxlint-disable-next-line no-await-in-loop
      await tellOneBrowser(
        tx,
        transport,
        listener,
        messageFor(notice, listener.owner.language),
        forThis,
        now
      );
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

/** What one person's post carries, once it is theirs to carry. */
export interface Post {
  userId: string;
  /** How many of each kind, so the message can name what is in it rather than count it. */
  kinds: { kind: AlertKind; count: number }[];
  total: number;
}

/**
 * Claims the day's quieter notices for the people waiting for them — in one statement, so
 * that two phones opening the app at six do not both carry the same post.
 *
 * Claiming and telling are deliberately separate. The claim is a write and belongs in a
 * transaction; the telling is a conversation with somebody else's server and must not happen
 * inside one, because a lock held across it is a lock every phone in the shed waits on, and
 * a push sent before that transaction commits can buzz a pocket about something the farm
 * then rolls back.
 *
 * A claimed notice is stamped whether or not a push reaches anybody. The stamp is what makes
 * the post go once; the notices are in the app either way, which is where the farm's record
 * of them has always been.
 */
export const claimTheDigest = async (
  tx: Tx,
  farmId: string,
  now: Date,
  /** Everything raised before this goes now; everything since waits for the next moment.
   *  That is what makes this a digest rather than a running commentary. */
  upTo: Date
): Promise<Post[]> => {
  const claimed = await tx
    .update(alert)
    .set({ carriedAt: now })
    .where(
      and(
        eq(alert.farmId, farmId),
        isNull(alert.carriedAt),
        isNull(alert.dismissedAt),
        lte(alert.createdAt, upTo),
        inArray(alert.kind, DIGESTIBLE)
      )
    )
    .returning({ userId: alert.userId, kind: alert.kind });

  const forEachPerson = new Map<string, Map<AlertKind, number>>();
  for (const row of claimed) {
    const theirs =
      forEachPerson.get(row.userId) ?? new Map<AlertKind, number>();
    theirs.set(row.kind, (theirs.get(row.kind) ?? 0) + 1);
    forEachPerson.set(row.userId, theirs);
  }
  return [...forEachPerson].map(([userId, kinds]) => ({
    userId,
    kinds: [...kinds].map(([kind, count]) => ({ kind, count })),
    total: [...kinds.values()].reduce((sum, count) => sum + count, 0),
  }));
};

/**
 * Carries a claimed post: one push each, naming what is in it — "two needing review, one new
 * version" rather than "three things waiting", because a number somebody has to go and
 * identify is a number they learn to ignore.
 *
 * An empty post is not sent. A farm whose phone buzzes to say nothing happened is a farm
 * that stops reading the ones that say something did.
 */
export const carryTheDigest = async (
  tx: Tx,
  transport: PushTransport,
  farmId: string,
  post: readonly Post[],
  now: Date
): Promise<{ people: number; told: Told }> => {
  const told: Told = { sent: 0, gone: 0, missed: 0 };
  if (post.length === 0) {
    return { people: 0, told };
  }
  const listeners = await listenersFor(
    tx,
    farmId,
    post.map((one) => one.userId)
  );
  for (const theirs of post) {
    const browsers = listeners.filter(
      (listener) => listener.userId === theirs.userId
    );
    for (const listener of browsers) {
      const message: PushMessage = {
        title: translate(listener.owner.language, "push.digestTitle"),
        body: theirs.kinds
          .map((each) =>
            translate(listener.owner.language, digestWording(each.kind), {
              count: each.count,
            })
          )
          .join(" · "),
        url: "/today",
        // One digest replaces the last rather than stacking: a phone showing three evenings
        // of them tells nobody anything.
        tag: `digest:${theirs.userId}`,
        lang: listener.owner.language,
      };
      // Sequential on purpose, as above.
      // oxlint-disable-next-line no-await-in-loop
      await tellOneBrowser(tx, transport, listener, message, told, now);
    }
  }
  return { people: post.length, told };
};
