import { DATABASE_IS_BEHIND, databaseIsBehind } from "@OpenFarm/api/readiness";
import { env } from "@OpenFarm/env/server";
import { definePlugin } from "nitro";

/** Anything but zero tells a supervisor the server did not come up. */
const REFUSED = 1;

/**
 * A built server whose database is behind the code stops as it starts, instead of coming up and failing one request
 * at a time. Readiness already said so, but only to whoever asked it; systemd sees a server that stopped.
 *
 * Not in development: there this runs in a worker Nitro restarts whenever it exits, so stopping it only turned the
 * refusal into a loop behind a server still listening. `vite.config.ts` refuses there instead, before it listens.
 */
export default definePlugin(async () => {
  if (import.meta.dev) {
    return;
  }
  if (await databaseIsBehind(env.DATABASE_URL)) {
    console.error(DATABASE_IS_BEHIND);
    process.exit(REFUSED);
  }
});
