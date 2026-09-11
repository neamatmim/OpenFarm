import { env } from "@OpenFarm/env/server";
import webpush from "web-push";

import type { PushTransport } from "./push";
import { silentTransport } from "./push";

/** What a push service says when the browser it knew is gone for good. */
const GONE = new Set([404, 410]);

/**
 * The farm's own voice over the web push protocol, or silence when it has no keys.
 *
 * A farm without keys is not a broken farm: the in-app Alert is the record, and push is the
 * tap on the shoulder. Development and the tests run silent, and nothing above this notices.
 */
export const webPush = (): PushTransport => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)) {
    return silentTransport;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? "mailto:farm@openfarm.invalid",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  return {
    send: async (target, message) => {
      try {
        await webpush.sendNotification(target, JSON.stringify(message));
        return { delivered: true, gone: false };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // A browser that has been wiped, or a subscription the service has forgotten. It
        // stops being told; nobody is troubled with it.
        return {
          delivered: false,
          gone: typeof status === "number" && GONE.has(status),
        };
      }
    },
  };
};
