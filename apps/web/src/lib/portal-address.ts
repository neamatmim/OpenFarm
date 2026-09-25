/**
 * The Investor Portal's front door — its sign-in page — as an Investor is told it: the one address they keep using,
 * printed on the Welcome Letter and behind its QR code, with any page of the portal beneath it. Read from here alone,
 * so the letter, its QR and the code dialog cannot point to different places. The portal is at `/portal` on this
 * address until it has one of its own (ADR 0009).
 */
export const portalAddress = (page = ""): string => {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/portal${page}`;
};

/** The scheme in front of an address, which nobody types. */
const SCHEME = /^https?:\/\//u;

/** The address as it is printed for somebody to type: without the `https://` nobody types. */
export const portalAddressTyped = (page = ""): string =>
  portalAddress(page).replace(SCHEME, "");
