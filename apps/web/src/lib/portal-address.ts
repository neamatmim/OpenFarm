/**
 * The Investor Portal's address as an Investor is told it: the one address they keep using, printed on the Welcome
 * Letter and behind its QR code, with any page of the portal beneath it. Read from here alone, so the letter, its QR
 * and the code dialog cannot point to different places.
 *
 * The portal's own origin, bare, once it has one (ADR 0009) — it opens the portal's sign-in — with its pages under
 * `/portal` as on the farm's; `/portal` on the address this page is on while it has none. The origin is the server's to
 * say, and comes with the code it is printed beside.
 */
export const portalAddress = (own: string | null, page = ""): string => {
  if (own !== null) {
    return page ? `${own}/portal${page}` : own;
  }
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/portal${page}`;
};

/** The scheme in front of an address, which nobody types. */
const SCHEME = /^https?:\/\//u;

/** The address as it is printed for somebody to type: without the `https://` nobody types. */
export const portalAddressTyped = (own: string | null, page = ""): string =>
  portalAddress(own, page).replace(SCHEME, "");
