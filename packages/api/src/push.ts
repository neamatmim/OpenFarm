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
const TITLE: Record<string, MessageKey> = {
  instance_overdue: "push.overdueTitle",
  instance_escalated: "push.escalatedTitle",
  instance_sent_back: "push.sentBackTitle",
  needs_review: "push.needsReviewTitle",
};

const BODY: Record<string, MessageKey> = {
  instance_overdue: "alerts.instanceOverdue",
  instance_escalated: "alerts.instanceEscalated",
  instance_sent_back: "alerts.instanceSentBack",
  needs_review: "alerts.needsReview",
};

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
  const title = TITLE[alert.kind];
  const body = BODY[alert.kind];
  return {
    title: title ? translate(reader, title) : translate(reader, "alerts.title"),
    body: body ? translate(reader, body, params) : alert.kind,
    url: alert.entity === "sop_instance" ? `/work/${alert.entityId}` : "/today",
    // One notice per thing per kind: a phone that has been in a pocket all morning should
    // show what is waiting, not a history of it being told.
    tag: `${alert.kind}:${alert.entityId}`,
  };
};
