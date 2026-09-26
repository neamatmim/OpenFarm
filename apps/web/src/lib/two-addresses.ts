import type { Hosts } from "@OpenFarm/auth/hosts";
import { HOSTS, hostOf, originOf } from "@OpenFarm/auth/hosts";

/** A portal page, at either address. */
const PORTAL_PAGE = /^\/portal(?:\/|$)/u;

/**
 * Everything the Investor address serves: the portal's pages and the built files they load, the sign-in, sign-out,
 * session and password routes of the portal's sign-in, the portal's own calls with who is asking and the language they
 * read in, and the server function that says who is signed in. Nothing else of the farm app.
 */
const SERVED_TO_INVESTORS: readonly RegExp[] = [
  PORTAL_PAGE,
  /^\/assets\//u,
  /^\/(?:icon\.svg|portal\.webmanifest|robots\.txt)$/u,
  /^\/api\/auth\/(?:sign-in\/email|sign-out|get-session|change-password|revoke-other-sessions)$/u,
  /^\/api\/rpc\/(?:portal\/[^/]+|people\/me|language\/[^/]+)$/u,
  // Every server function, since they are told apart only by a hash of the build: today there is one, `getUser`, and a
  // test stops a second arriving unseen.
  /^\/_serverFn\//u,
];

/**
 * What the server answers a request sent to the wrong one of the farm's two addresses, or nothing for one it serves
 * (ADR 0009). The bare Investor address opens the portal; anything there that is not the portal's is not found; a
 * portal page asked for at the farm's address moves to the same page on the Investor's, for good. While the portal has
 * no address of its own, nothing is at the wrong one.
 */
export const atTheWrongAddress = (
  request: Request,
  hosts: Hosts = HOSTS
): Response | null => {
  if (hosts.portal === null) {
    return null;
  }
  const url = new URL(request.url);
  const portal = originOf("portal", hosts);
  if (hostOf(request.url, hosts) === "farm") {
    return PORTAL_PAGE.test(url.pathname)
      ? Response.redirect(`${portal}${url.pathname}${url.search}`, 301)
      : null;
  }
  if (url.pathname === "/") {
    // Not for good: where the front door leads is the farm's to change.
    return Response.redirect(`${portal}/portal`, 302);
  }
  const served = SERVED_TO_INVESTORS.some((path) => path.test(url.pathname));
  return served ? null : new Response("Not found", { status: 404 });
};
