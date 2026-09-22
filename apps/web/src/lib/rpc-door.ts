export type Refusal = "another-site" | "not-by-link";

/** The one page under the API a browser may simply open. */
const API_REFERENCE = "/api/rpc/api-reference";

/**
 * Why the farm's API will not answer this request, or null when it will.
 *
 * The browser attaches the farm's sign-in cookie to any request for the farm's address, whoever's page sent it, so
 * a request from another website's page is refused before anything is read. A procedure answers a GET as readily as
 * a POST, and not every browser says where a GET came from — older Android WebViews and Safari send no
 * Sec-Fetch-Site — so a link followed on another site could not be told from the app's own. The app never sends a
 * GET, so the API takes none but the reference page's. Requests with no Origin — a phone's own app, a script on the
 * server — are not from a page at all.
 */
export const whyRefused = (
  request: Request,
  trustedOrigins: readonly string[]
): Refusal | null => {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return "another-site";
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const { pathname } = new URL(request.url);
    const readingTheReference =
      pathname === API_REFERENCE || pathname.startsWith(`${API_REFERENCE}/`);
    return readingTheReference ? null : "not-by-link";
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }
  const trusted = new Set([
    new URL(request.url).origin,
    ...trustedOrigins.map((one) => new URL(one).origin),
  ]);
  return trusted.has(origin) ? null : "another-site";
};
