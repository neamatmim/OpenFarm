import { settleFarmLocale } from "@OpenFarm/api/farm-locale";
import { pushKeysProblem } from "@OpenFarm/api/push-web";
import { samplesLeft } from "@OpenFarm/api/samples-left";
import { env } from "@OpenFarm/env/server";
import { definePlugin } from "nitro";

/**
 * Reads the farm's configuration while the server is starting, so a missing secret, a plain-HTTP address, a sample
 * left from the example or a currency or time zone the farm cannot count in stops it there. Read lazily, as every request otherwise reads it,
 * a bad value let the server come up and answer 500 to everything, and a supervisor that restarts a server that
 * stopped never saw one that had.
 */
export default definePlugin(() => {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  settleFarmLocale();
  const samples = samplesLeft();
  if (process.env.NODE_ENV === "production" && samples.length > 0) {
    throw new Error(
      `${samples.join(", ")} still say example.com, as .env.example has them: set the farm's own`
    );
  }
  // A farm whose phones agree to be told, and are never told, is worse than one that says it cannot push.
  const push = pushKeysProblem();
  if (push) {
    throw new Error(push);
  }
});
