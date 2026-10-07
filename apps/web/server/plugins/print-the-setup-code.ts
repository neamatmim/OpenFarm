import { productionWiring } from "@OpenFarm/api/context";
import { asLogged } from "@OpenFarm/api/thrown";
import { setUpCodeIfNoFarm } from "@OpenFarm/auth/setup-code";
import { definePlugin } from "nitro";

/**
 * A production server with no farm set up prints the first Owner's setup code in its own log, once: whoever signs up
 * with the Owner's address must give it, so only somebody who can read this log — the Owner, on the server — can
 * open the account that becomes the farm's Owner (the Owner, 2026-10-07). Once the farm exists the code is forgotten.
 *
 * Not in development, where the first account needs no code.
 */
export default definePlugin(async () => {
  if (import.meta.dev) {
    return;
  }
  try {
    const code = await setUpCodeIfNoFarm(productionWiring().db, new Date());
    if (code) {
      console.warn(
        `No farm is set up yet. The Owner signs up with OPENFARM_OWNER_EMAIL and this setup code: ${code}`
      );
    }
  } catch (error) {
    console.error("the setup code could not be made", asLogged(error));
  }
});
