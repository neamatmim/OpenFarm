import { env } from "@OpenFarm/env/server";
import webpush from "web-push";

import type { PushTransport } from "./push";
import { silentTransport } from "./push";

/** What a push service says when the browser it knew is gone for good. */
const GONE = new Set([404, 410]);
/** How long one send may take before the farm stops waiting on it. */
const SEND_TIMEOUT_MS = 5000;

/** Whom a push service may write to about the farm's pushes: an address it can mail, or a page. */
const A_SUBJECT = /^(?:mailto:|https:\/\/)/u;

/**
 * What is wrong with the farm's push keys, or nothing — checked as the server starts. Keys half given, a subject the
 * push services will not take, or a private key the library will not read used to turn pushes off without a word while
 * phones still agreed to be told; now the server stops and says which.
 */
export const pushKeysProblem = (
  keys: {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  } = env
): string | null => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = keys;
  if (!(VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY || VAPID_SUBJECT)) {
    return null;
  }
  if (!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT)) {
    return "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT go together: set all three, or none for a farm that does not push";
  }
  if (!A_SUBJECT.test(VAPID_SUBJECT)) {
    return `VAPID_SUBJECT must begin mailto: or https:// — "${VAPID_SUBJECT}" is neither`;
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (error) {
    return `The push keys will not do: ${(error as Error).message}`;
  }
  return null;
};

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
  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT ?? "mailto:farm@openfarm.invalid",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  } catch {
    // Keys the library will not take. A farm that cannot push is a farm that does not push;
    // it is not a farm that fails every request, which is what throwing here would mean —
    // this runs while the first request of the process is building its context.
    return silentTransport;
  }
  return {
    send: async (target, message) => {
      try {
        await webpush.sendNotification(target, JSON.stringify(message), {
          // A push service that will not answer must not become a farm that will not
          // answer: everyone's phone calls the sweep when the app opens.
          timeout: SEND_TIMEOUT_MS,
        });
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
