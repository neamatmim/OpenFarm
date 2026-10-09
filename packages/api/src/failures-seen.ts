/**
 * The server's own failures, counted in memory: a call that threw something nobody expected, a page that would not
 * render. Not a refusal — the farm refusing a wrong Tag Number or a stale Correction is the farm working — and not a
 * farm record, so never written to the database. Kept per server process, as the wrong guesses are: a restart forgets,
 * and a server that has just restarted has not failed yet. Kept on the process rather than in this module, because the
 * production build bundles this module twice, and failures counted in one copy were not seen by the other.
 *
 * Read by the server's own timer, which tells the Owner when there are too many in an hour (`the-machinery-notices`),
 * and by the systems page.
 */
const FAILURES = Symbol.for("openfarm.failures-seen");
const onTheProcess = globalThis as { [FAILURES]?: number[] };
onTheProcess[FAILURES] ??= [];
const seen = onTheProcess[FAILURES];

/** How long a failure counts for. Longer than the timer's five minutes by enough that a burst is not missed between
 *  two turns, and short enough that one bad morning is forgotten by the afternoon. */
export const FAILURES_COUNT_FOR_MS = 60 * 60_000;

/** Nothing older than the window is remembered, so a server failing once an hour for a year holds one. */
const forgetTheOld = (now: Date): void => {
  const since = now.getTime() - FAILURES_COUNT_FOR_MS;
  let old = 0;
  while (old < seen.length && (seen[old] ?? 0) <= since) {
    old += 1;
  }
  if (old > 0) {
    seen.splice(0, old);
  }
};

export const aFailureWasSeen = (now: Date = new Date()): void => {
  forgetTheOld(now);
  seen.push(now.getTime());
};

/** The failures of the last hour: how many, and when the first of them came. */
export const failuresInTheLastHour = (
  now: Date
): { count: number; since: Date | null } => {
  forgetTheOld(now);
  const [first] = seen;
  return {
    count: seen.length,
    since: first === undefined ? null : new Date(first),
  };
};

/** For a test, which must not read another's failures. */
export const forgetEveryFailure = (): void => {
  seen.length = 0;
};
