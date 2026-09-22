import { env } from "@OpenFarm/env/server";
import { definePlugin } from "nitro";

/**
 * Reads the farm's configuration while the server is starting, so a missing secret or a plain-HTTP address stops
 * it there. Read lazily, as every request otherwise reads it, a bad value let the server come up and answer 500 to
 * everything, and a supervisor that restarts a server that stopped never saw one that had.
 */
export default definePlugin(() => {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
});
