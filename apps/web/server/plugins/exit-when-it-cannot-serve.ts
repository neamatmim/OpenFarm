import { definePlugin } from "nitro";

/** Often enough that a supervisor sees the failure at once, rarely enough to cost nothing. */
const CHECK_EVERY_MS = 1000;

/**
 * A server that could not take its port stops, instead of lingering.
 *
 * srvx answers a port already in use by printing the error and setting the exit code, expecting the process to end
 * once nothing else keeps it busy. The farm's five-minute timer always does, so the process stayed up: listening to
 * nobody, still turning the day, and — under systemd — reported as running, so never restarted. This finishes what
 * the failure already decided.
 */
export default definePlugin(() => {
  const watching = setInterval(() => {
    if (process.exitCode) {
      clearInterval(watching);
      process.exit();
    }
  }, CHECK_EVERY_MS);
  // Never the thing that keeps the process alive.
  watching.unref();
});
