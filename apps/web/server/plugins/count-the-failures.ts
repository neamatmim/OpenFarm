import { aFailureWasSeen } from "@OpenFarm/api/failures-seen";
import { definePlugin } from "nitro";

/**
 * A request the server could not answer at all — a page that would not render, a door that threw — is counted with the
 * API calls that failed (`lib/rpc-failure-log`), so the server's own timer can tell the Owner when the hour holds too
 * many. The log line itself is evlog's; this only counts.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("error", () => {
    aFailureWasSeen();
  });
});
