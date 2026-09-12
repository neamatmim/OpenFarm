import { env } from "@OpenFarm/env/server";

import type { SmsMessage, SmsTransport } from "./sms";
import { silentSms } from "./sms";

/** How long one message may take before the farm stops waiting on it. The same reasoning as
 *  the push service's: a gateway that will not answer must not become a farm that will not
 *  answer, and this is called from the sweep every phone on the farm runs. */
const SEND_TIMEOUT_MS = 5000;

/**
 * The farm's own SMS gateway, over plain HTTP form posts — which is what the local Bangladeshi
 * providers offer, and what the Owner will have credentials for.
 *
 * Configured at go-live and silent until then: a farm without a gateway sends nothing and is
 * none the worse for it, because the in-app Alert is the record either way. Built and tested
 * before the account exists, which is the point of the transport being injected.
 */
export const smsGateway = (): SmsTransport => {
  const url = env.SMS_GATEWAY_URL;
  const key = env.SMS_GATEWAY_KEY;
  const from = env.SMS_GATEWAY_FROM;
  if (!(url && key)) {
    return silentSms;
  }
  return {
    send: async (to: string, message: SmsMessage) => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            api_key: key,
            to,
            msg: message.text,
            ...(from ? { from } : {}),
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        return { delivered: response.ok };
      } catch {
        // The gateway is somebody else's server. A farm whose text did not go still has the
        // Alert in the app, and a throw here would take the whole sweep down with it.
        return { delivered: false };
      }
    },
  };
};
