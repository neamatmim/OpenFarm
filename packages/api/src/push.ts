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
export const digestWording = (kind: AlertKind): MessageKey => SAYS[kind].digest;
