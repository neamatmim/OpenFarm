import type { AlertKind, DELIVERY } from "@OpenFarm/domain";
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

/** The kinds the farm's delivery table says go by text — read from the table itself, so a kind
 *  marked for texting and given no words is a compile error here rather than silence on
 *  somebody's phone. */
type TextableKind = {
  [K in AlertKind]: (typeof DELIVERY)[K] extends { sms: true } ? K : never;
}[AlertKind];

/**
 * What a text message says, for the kinds that travel this way. The table decides *that* one
 * goes; this says what it says, and the two cannot drift apart.
 */
const WORDING: Record<TextableKind, MessageKey> = {
  withdrawal_ending: "sms.withdrawalEnding",
  notifiable_diagnosis: "sms.notifiableDiagnosis",
};

/** The message for one notice in one person's language, or nothing when this kind does not go
 *  by text at all. */
export const smsFor = (
  kind: AlertKind,
  params: MessageParams,
  person: { language?: string | null } | null
): SmsMessage | null => {
  const key = WORDING[kind as TextableKind] as MessageKey | undefined;
  if (!key) {
    return null;
  }
  const lang = resolveLanguage(person);
  return { text: translate(lang, key, params), lang };
};
