// What a page may load and run, by which of the farm's two addresses it is on (ADR 0009).

/**
 * Only the parts of a policy that cannot break the app: no plugins, no framing, no rewriting where relative links
 * point, forms sent only to the farm. Scripts are left alone — the theme and the server render write inline ones — so
 * this is not a defence against injected script, only against the page being borrowed.
 */
export const FARM_POLICY =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";

/**
 * The Investor address's own policy, strict because it is an origin of its own (ADR 0009): scripts only from itself
 * or carrying this answer's nonce, which the router and the theme put on the ones they write inline; nothing fetched
 * or sent anywhere but itself. Styles may be inline — the components set them — and pictures may be data the page
 * made.
 */
export const portalPolicy = (nonce: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
