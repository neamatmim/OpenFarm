import { asLogged } from "./thrown";

/** How long the watch is waited for: a ping is a courtesy to it, and never holds the farm's timer. */
const WATCH_WAIT_MS = 10_000;

/**
 * Tells the outside watch the farm turned its day whole (`OPENFARM_WATCH_URL`, a check-in address such as a
 * healthchecks.io ping). The farm's own alarms — a day not turning, backups overdue — run inside the app, so a server
 * down or an app dead says nothing; the watch hears nothing then, and raises the alarm itself (deploy runbook, "The
 * outside watch"). Nothing where the Owner has set none, and never in the farm's way: no signal, and the turn is still
 * whole.
 */
export const pingTheWatch = async (
  url: string | undefined,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<void> => {
  if (!url) {
    return;
  }
  try {
    await fetcher(url, { signal: AbortSignal.timeout(WATCH_WAIT_MS) });
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error("the outside watch did not answer", asLogged(error));
  }
};
