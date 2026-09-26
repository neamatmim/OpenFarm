import type { QueryClient } from "@tanstack/react-query";

import { pageHost } from "./page-context";
import { forgetWhatThisPhoneRead } from "./query-cache";
import { ENDED_SIGN_IN_PAGE } from "./wipe";

/**
 * Leaves a portal sign-in that has run its day: what was read in it forgotten, in the tab and on the phone, and on the
 * portal's own address the sign-in page asked of the server, whose answer wipes the address (lib/wipe) — waiting on
 * that page rather than drawing another meanwhile. Elsewhere it returns, for the caller to show the sign-in page.
 */
export const leaveTheEndedSignIn = async (
  queryClient: QueryClient
): Promise<void> => {
  await forgetWhatThisPhoneRead(queryClient);
  if (pageHost() !== "portal") {
    return;
  }
  window.location.replace(ENDED_SIGN_IN_PAGE);
  // oxlint-disable-next-line promise/avoid-new -- the page is being replaced; nothing here is to be drawn meanwhile
  await new Promise<never>(() => {
    // Never settled: the page is going.
  });
};
