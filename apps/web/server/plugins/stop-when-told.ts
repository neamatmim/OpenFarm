import { setTimeout as after } from "node:timers/promises";

import { turnStillRunning } from "@OpenFarm/api/scheduler";
import { definePlugin } from "nitro";

/** Long enough for a turn already running to finish; well inside systemd's thirty seconds before it kills. */
const LONGEST_WAIT_MS = 20_000;

/** Long enough for the HTTP server srvx is closing to answer the requests it already took. */
const LET_REQUESTS_FINISH_MS = 1500;

/**
 * A server told to stop, stops.
 *
 * srvx answers SIGTERM by closing its HTTP server and never ends the process, and Nitro's five-minute timer keeps it
 * alive: the half-stopped server went on turning the day, every restart waited out systemd's thirty seconds before it
 * was killed, the farm answered 502 meanwhile, and the kill was reported as a failure — setting off the crash alarm on
 * every deploy. Here it lets a turn already running finish, gives the requests already taken a moment, and exits.
 *
 * Not in development: there this runs in a worker Nitro restarts whenever it exits (see refuse-an-old-database).
 */
export default definePlugin(() => {
  if (import.meta.dev) {
    return;
  }
  const stop = async () => {
    const giveUp = setTimeout(() => process.exit(0), LONGEST_WAIT_MS);
    giveUp.unref();
    await turnStillRunning();
    await after(LET_REQUESTS_FINISH_MS, undefined, { ref: false });
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
});
