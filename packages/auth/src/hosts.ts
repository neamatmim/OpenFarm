import { env } from "@OpenFarm/env/server";

/**
 * The farm's two addresses (ADR 0009): its own, where staff work, and the Investor Portal's, `investors.<farm-domain>`,
 * where Investors do. Each serves only its own people, and each trusts only itself. Until the portal is given an
 * address of its own there is one, and the portal is at `/portal` on it, as it was built.
 *
 * Called hosts here, since which one a request came to is read from the host it names, and an Investor's or the farm's
 * address is where they live.
 */

/** Which of the farm's two addresses a request came to. */
export type Host = "farm" | "portal";

/** The farm's public origins: its own, and the portal's where it has one. */
export interface Hosts {
  farm: string;
  portal: string | null;
}

/** Where the farm is deployed, each as a bare origin whatever path or slash was written after it. */
export const HOSTS: Hosts = {
  farm: new URL(env.BETTER_AUTH_URL).origin,
  portal: env.PORTAL_URL ? new URL(env.PORTAL_URL).origin : null,
};

/**
 * Which address a request was sent to, by the host it names: the portal's only where the portal has an address of its
 * own and the request names it; the farm's otherwise.
 */
export const hostOf = (url: string, hosts: Hosts = HOSTS): Host =>
  hosts.portal !== null && new URL(url).host === new URL(hosts.portal).host
    ? "portal"
    : "farm";

/** The portal's own origin, or nothing while it is at `/portal` on the farm's. */
export const portalOrigin = (hosts: Hosts = HOSTS): string | null =>
  hosts.portal === null ? null : new URL(hosts.portal).origin;

/**
 * An address's public origin: where somebody on the other one is sent. The portal's is the farm's while it has none of
 * its own, since that is where it then is.
 */
export const originOf = (host: Host, hosts: Hosts = HOSTS): string =>
  host === "portal"
    ? (portalOrigin(hosts) ?? new URL(hosts.farm).origin)
    : new URL(hosts.farm).origin;

/** Where each address's people sign in, as the page that turned them away links to it. */
const SIGN_IN_PAGE: Record<Host, string> = {
  farm: "/login",
  portal: "/portal/login",
};

/** The sign-in page of an address: where somebody who signed in at the other is sent. */
export const signInPageOf = (host: Host, hosts: Hosts = HOSTS): string =>
  `${originOf(host, hosts)}${SIGN_IN_PAGE[host]}`;
