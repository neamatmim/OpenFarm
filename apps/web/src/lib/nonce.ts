import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";

/**
 * This answer's nonce, handed to the app by the server entry in the request's own context — never read from anything
 * the caller sent — and only on the Investor address, whose policy asks for it (ADR 0009).
 */
export interface NonceContext {
  nonce?: string;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: NonceContext };
  }
}

/** This answer's nonce, while the server writes the page; nothing in the browser, which writes no inline script. */
export const pageNonce = createIsomorphicFn()
  .server(() => getGlobalStartContext()?.nonce)
  .client((): string | undefined => undefined);
