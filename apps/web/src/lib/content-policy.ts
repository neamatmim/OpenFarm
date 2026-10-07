// What a page may load and run, by which of the farm's two addresses it is on (ADR 0009).

/**
 * A policy for a page: scripts only from the address itself or carrying this answer's nonce, which the router and the
 * theme put on the ones they write inline; nothing fetched or sent anywhere but itself. Styles may be inline — the
 * components set them — and pictures may be data the page made. Both addresses load nothing from anywhere else, so
 * both can hold to it.
 */
const policyWith = (nonce: string, baseUri: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    `base-uri ${baseUri}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");

/**
 * The farm address's policy. It once left scripts alone, so a script slipped into a page — a name, a note — would have
 * run with the Owner's own session and every Investor's NID and bank account within reach; now it is as strict as the
 * Investor address's.
 */
export const farmPolicy = (nonce: string) => policyWith(nonce, "'self'");

/** The Investor address's own policy, strict because it is an origin of its own (ADR 0009). */
export const portalPolicy = (nonce: string) => policyWith(nonce, "'none'");
