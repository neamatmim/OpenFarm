import type { Host } from "@OpenFarm/auth/hosts";

/**
 * What a browser keeps for an address: its cache and its storage, service workers among it. Not its cookies: a browser
 * wipes those for the whole farm domain at once, so the farm's own address would be signed out with the portal. The
 * portal's own cookie goes with signing out, and a sign-in that has run its day is already over at the server. The
 * reader's language and theme go with the storage: the next person to pick the phone up chooses their own.
 */
export const WIPE = '"cache", "storage"';

/** The page a sign-in that has run its day is sent to, and what its address says of it. */
const ENDED_SIGN_IN = "/portal/login";
const ENDED = "ended";

/** Where a sign-in that has run its day is sent, asked of the server so its answer wipes the address. */
export const ENDED_SIGN_IN_PAGE = `${ENDED_SIGN_IN}?${ENDED}=true`;

/**
 * Whether an answer tells the browser to wipe the address it came from (`Clear-Site-Data`): on the Investor address,
 * signing out, and the sign-in page a sign-in that has run its day is sent to — so a shared phone keeps nothing of
 * the portal once its Investor has left it (ADR 0009). Never on the farm's address, where a wipe would take a
 * milker's unsent Outbox with it.
 */
export const wipesTheDevice = (request: Request, host: Host): boolean => {
  if (host !== "portal") {
    return false;
  }
  const url = new URL(request.url);
  const signingOut =
    request.method === "POST" && url.pathname === "/api/auth/sign-out";
  const dayIsDone =
    url.pathname === ENDED_SIGN_IN && url.searchParams.get(ENDED) === "true";
  return signingOut || dayIsDone;
};

/** An answer as it leaves: with the wipe where `wipesTheDevice` says so, and otherwise as it was. */
export const withTheWipe = (
  request: Request,
  host: Host,
  answer: Response
): Response => {
  if (!wipesTheDevice(request, host)) {
    return answer;
  }
  const headers = new Headers(answer.headers);
  headers.set("clear-site-data", WIPE);
  return new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers,
  });
};
