import type { Host } from "@OpenFarm/auth/hosts";
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";

/**
 * What the server entry tells the app about the answer it is writing, in the request's own context — never read from
 * anything the caller sent: which of the farm's two addresses the page is on, and on the Investor address the nonce
 * its policy lets inline scripts run by (ADR 0009).
 */
export interface PageContext {
  host?: Host;
  nonce?: string;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: PageContext };
  }
}

/** Where the server writes which address the page is on, for the browser to read back. */
export const HOST_ATTRIBUTE = "data-host";

/** This answer's nonce, while the server writes the page; nothing in the browser, which writes no inline script. */
export const pageNonce = createIsomorphicFn()
  .server(() => getGlobalStartContext()?.nonce)
  .client((): string | undefined => undefined);

/**
 * Which of the farm's addresses the page is on: the server's own word while it writes the page, and in the browser
 * what it wrote on the page's root — the farm's where it wrote nothing.
 */
export const pageHost = createIsomorphicFn()
  .server((): Host => getGlobalStartContext()?.host ?? "farm")
  .client((): Host =>
    document.documentElement.getAttribute(HOST_ATTRIBUTE) === "portal"
      ? "portal"
      : "farm"
  );
