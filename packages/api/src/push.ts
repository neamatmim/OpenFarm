import type { AlertKind } from "@OpenFarm/domain";
import { ALERT_KINDS, SAYS, goesNow, noticeFilling } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
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

/** The places a kind leads to whatever it names, as the in-app list's own (alert-list.tsx). */
const PLACE_OF: Partial<Record<string, string>> = {
  day_not_turning: "/farm/backups",
  backup_overdue: "/farm/backups",
  monthly_copy_failed: "/farm/backups",
  entry_rejected: "/outbox",
  // Filed under work, but about many pieces of it: the list they are on, never one card.
  work_missed: "/review-queue/overdue",
  pen_sores_seen: "/observations",
};

/**
 * Where a push opens, as the in-app list leads: a kind's own place; a Venture's Investors for an Investor's note; the
 * work it is about; the animal it names by her tag; else the day's list.
 */
export const urlOf = (alert: {
  kind?: string;
  entity: string;
  entityId: string;
  params: unknown;
}): string => {
  const place = alert.kind ? PLACE_OF[alert.kind] : undefined;
  if (place) {
    return place;
  }
  const params = (alert.params ?? {}) as { tag?: unknown; ventureId?: unknown };
  if (
    alert.kind === "pay_in_note_sent" &&
    typeof params.ventureId === "string"
  ) {
    return `/ventures/${params.ventureId}/investors`;
  }
  if (alert.entity === "sop_instance") {
    return `/work/${alert.entityId}`;
  }
  return typeof params.tag === "string" ? `/animals/${params.tag}` : "/work";
};

/** What a kind says in a pocket, and nothing for the kinds that do not travel that way: the farm's own table puts a
 *  Needs Review in the evening's post, not in somebody's pocket. */
const inAPocket = (kind: AlertKind) => SAYS[kind].push;

/**
 * Is this the sort of notice that reaches into a pocket the moment it is raised?
 *
 * Asked of the farm's own delivery table as well as of its words: having words for a kind and carrying it immediately
 * are two different decisions, and answering this by the words alone would make a digest kind an Alert the day
 * somebody gave it a title.
 */
export const travelsByPush = (kind: string): boolean =>
  (ALERT_KINDS as readonly string[]).includes(kind) &&
  goesNow(kind as AlertKind) &&
  inAPocket(kind as AlertKind) !== undefined;

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
  const params = noticeFilling(alert.kind, alert.params, reader);
  const said = inAPocket(alert.kind as AlertKind);
  return {
    lang: reader,
    title: said
      ? translate(reader, said.title)
      : translate(reader, "alerts.title"),
    body: said ? translate(reader, said.body, params) : alert.kind,
    url: urlOf(alert),
    // One notice per thing per kind: a phone that has been in a pocket all morning should
    // show what is waiting, not a history of it being told.
    tag: `${alert.kind}:${alert.entityId}`,
  };
};

/** The kinds a Digest carries, from the farm's own delivery table. */
export const DIGESTIBLE = ALERT_KINDS.filter((kind) => !goesNow(kind));

/** How a Digest names what is in it: so many of this, so many of that, rather than a count
 *  of things the reader then has to go and find. */
export const digestWording = (kind: AlertKind): MessageKey => SAYS[kind].digest;
