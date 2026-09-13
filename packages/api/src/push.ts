import type { AlertKind } from "@OpenFarm/domain";
import { ALERT_KINDS, goesNow } from "@OpenFarm/domain";
import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import { resolveLanguage, translate } from "@OpenFarm/i18n";

/** What one browser is told. Small on purpose: a push carries the news, and the app carries
 *  the detail once somebody opens it. */
export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap should take them. */
  url: string;
  /** So a second notice about the same work replaces the first rather than stacking. */
  tag: string;
  /** What the words are in, so a screen reader says them properly. */
  lang: Language;
}

/** One browser, as the push service knows it. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * How a message actually leaves the farm. An interface because it has to be replaceable:
 * the tests send to a fake, development sends nowhere at all, and production sends over the
 * web push protocol. Nothing above this layer knows the difference.
 */
export interface PushTransport {
  send: (
    target: PushTarget,
    message: PushMessage
  ) => Promise<{ delivered: boolean; gone: boolean }>;
}

/** A farm with no push keys is a farm that does not push. The in-app Alert is the record
 *  either way, so there is nothing to fail and nothing to tell anyone. */
export const silentTransport: PushTransport = {
  send: () => Promise.resolve({ delivered: false, gone: false }),
};

/** What each kind of Alert says, in the reader's own language. */
/** What each kind says, and nothing for the kinds that do not travel this way: the
 *  notification table puts Needs Review in the evening digest, not in somebody's pocket. */
const WORDING: Partial<
  Record<AlertKind, { title: MessageKey; body: MessageKey }>
> = {
  instance_overdue: {
    title: "push.overdueTitle",
    body: "alerts.instanceOverdue",
  },
  instance_escalated: {
    title: "push.escalatedTitle",
    body: "alerts.instanceEscalated",
  },
  entry_rejected: {
    title: "push.entryRejectedTitle",
    body: "push.entryRejectedBody",
  },
  withdrawal_changed: {
    title: "push.withdrawalChangedTitle",
    body: "push.withdrawalChangedBody",
  },
  instance_sent_back: {
    title: "push.sentBackTitle",
    body: "alerts.instanceSentBack",
  },
};

/**
 * Is this the sort of notice that reaches into a pocket the moment it is raised?
 *
 * Asked of the farm's own delivery table and nowhere else: having words for a kind and
 * carrying it immediately are two different decisions, and when `kind in WORDING` answered
 * this question, giving a digest kind a title would quietly have made it an Alert.
 */
export const travelsByPush = (kind: string): boolean =>
  (ALERT_KINDS as readonly string[]).includes(kind) &&
  goesNow(kind as AlertKind) &&
  kind in WORDING;

const MINUTES_PER_HOUR = 60;

/** The Alert's snapshotted params, as a message wants them. */
const wording = (params: unknown, bangla: boolean): MessageParams => {
  const raw = (params ?? {}) as Record<string, unknown>;
  return {
    sop: String((bangla ? raw.sopBn : raw.sopEn) ?? raw.sopBn ?? ""),
    pen: String(raw.pen ?? ""),
    reason: String(raw.reason ?? ""),
    hours: Math.max(
      1,
      Math.round(Number(raw.minutesOverdue ?? 0) / MINUTES_PER_HOUR)
    ),
  };
};

/**
 * One Alert, written for one person. The language is theirs, not the farm's: a Vet who reads
 * English and a milker who reads Bangla get the same news in different words, and a message
 * nobody can read is a message nobody acts on.
 */
export const messageFor = (
  alert: { kind: string; entity: string; entityId: string; params: unknown },
  language: string | null
): PushMessage => {
  const reader: Language = resolveLanguage({ language });
  const params = wording(alert.params, reader === "bn");
  const said = WORDING[alert.kind as AlertKind];
  return {
    lang: reader,
    title: said
      ? translate(reader, said.title)
      : translate(reader, "alerts.title"),
    body: said ? translate(reader, said.body, params) : alert.kind,
    url: alert.entity === "sop_instance" ? `/work/${alert.entityId}` : "/today",
    // One notice per thing per kind: a phone that has been in a pocket all morning should
    // show what is waiting, not a history of it being told.
    tag: `${alert.kind}:${alert.entityId}`,
  };
};

/** The kinds a Digest carries, from the farm's own delivery table. */
export const DIGESTIBLE = ALERT_KINDS.filter((kind) => !goesNow(kind));

/** How a Digest names what is in it: so many of this, so many of that, rather than a count
 *  of things the reader then has to go and find. */
export const DIGEST_WORDING: Record<AlertKind, MessageKey> = {
  instance_overdue: "digest.overdue",
  instance_escalated: "digest.escalated",
  instance_sent_back: "digest.sentBack",
  needs_review: "digest.needsReview",
  sop_published: "digest.sopPublished",
  /** Never carried in a Digest — it goes the moment it is raised — but the table is over
   *  every kind, so that a new one cannot be forgotten here. */
  withdrawal_ending: "digest.withdrawalEnding",
  notifiable_diagnosis: "digest.notifiable",
  entry_rejected: "digest.entryRejected",
  withdrawal_changed: "digest.withdrawalChanged",
  low_stock: "digest.lowStock",
  sop_proposed: "digest.sopProposed",
};
