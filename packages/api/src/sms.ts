import type { AlertKind } from "@OpenFarm/domain";
import { SAYS } from "@OpenFarm/domain";
import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import { resolveLanguage, translate } from "@OpenFarm/i18n";

/** One text message. Short on purpose: it carries the news, and the app carries the detail. */
export interface SmsMessage {
  text: string;
  /** What the words are in, so a gateway that cares about encoding can be told. */
  lang: Language;
}

/**
 * How a text message actually leaves the farm. An interface because it has to be replaceable:
 * the tests send to a fake, development sends nowhere, and at go-live the Owner's own gateway is
 * configured with credentials the Owner holds. Nothing above this layer knows the difference —
 * which is also what lets the path be built and tested before the account exists.
 */
export interface SmsTransport {
  send: (
    /** A number as the farm wrote it down. */
    to: string,
    message: SmsMessage
  ) => Promise<{ delivered: boolean }>;
}

/** A farm with no gateway configured is a farm that does not text. The in-app Alert is the
 *  record either way, so there is nothing to fail and nobody to tell. */
export const silentSms: SmsTransport = {
  send: () => Promise.resolve({ delivered: false }),
};

/** What a text message says, for the kinds that travel this way: the farm's own words for each kind. Which kinds
 *  those are is the delivery table's to say, and the words are typed from it — a kind marked for texting with
 *  nothing to say is a compile error there, not silence on somebody's phone. */
const inATextMessage = (kind: AlertKind): MessageKey | undefined =>
  SAYS[kind].sms;

/** The message for one notice in one person's language, or nothing when this kind does not go
 *  by text at all. */
export const smsFor = (
  kind: AlertKind,
  params: MessageParams,
  person: { language?: string | null } | null
): SmsMessage | null => {
  const key = inATextMessage(kind);
  if (!key) {
    return null;
  }
  const lang = resolveLanguage(person);
  return { text: translate(lang, key, params), lang };
};
