import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { setSignedInPerson } from "@/lib/device";
import { forgetWhatThisPhoneRead } from "@/lib/query-cache";

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
  await authClient.signOut();
};
