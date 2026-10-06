import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { setSignedInPerson } from "@/lib/device";
import { currentListener } from "@/lib/push";
import { forgetWhatThisPhoneRead } from "@/lib/query-cache";
import { client } from "@/utils/orpc";

/**
 * Asks the farm to stop pushing to this browser, while it is still signed in to ask: signed out, a browser on the office
 * computer would go on buzzing with the last person's money on its lock screen, and the next person could not take it
 * (the Owner, 2026-10-06). The browser's own subscription is kept for whoever subscribes it next. Never in the way of
 * signing out: no signal, or nothing subscribed, and sign-out goes on.
 */
const stopTellingThisBrowser = async (): Promise<void> => {
  try {
    const listening = await currentListener();
    if (listening) {
      await client.push.unsubscribe({ endpoint: listening.endpoint });
    }
  } catch {
    // Signing out comes first.
  }
};

/**
 * Signs whoever is in out of this browser, the farm's side or the portal's: what they read is forgotten first — in the
 * tab and on the phone — so nothing stays behind them for the next person even if signing out itself does not go
 * through (ASVS 14.3.1), and the phone stops naming them as the person whose entries it records.
 */
export const signOutOfThisPhone = async (
  queryClient: QueryClient
): Promise<void> => {
  await forgetWhatThisPhoneRead(queryClient);
  setSignedInPerson(null);
  await stopTellingThisBrowser();
  await authClient.signOut();
};
