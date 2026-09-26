import { hostOf } from "@OpenFarm/auth/hosts";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { FARM_POLICY, portalPolicy } from "./lib/content-policy";
import { atTheWrongAddress } from "./lib/two-addresses";
import { withTheWipe } from "./lib/wipe";

const withSecurityHeaders = (response: Response, policy: string): Response => {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("content-security-policy", policy);
  headers.set(
    "permissions-policy",
    "geolocation=(), microphone=(), payment=(), usb=()"
  );
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains"
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** A nonce nobody can guess, fresh for each answer. */
const aNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCodePoint(...bytes));
};

export default createServerEntry({
  fetch: async (request) => {
    const elsewhere = atTheWrongAddress(request);
    if (elsewhere) {
      return withSecurityHeaders(elsewhere, FARM_POLICY);
    }
    if (hostOf(request.url) === "portal") {
      const nonce = aNonce();
      // The router puts it on the scripts it writes into the page (lib/page-context).
      const answer = await handler.fetch(request, {
        context: { host: "portal", nonce },
      });
      return withTheWipe(
        request,
        "portal",
        withSecurityHeaders(answer, portalPolicy(nonce))
      );
    }
    return withSecurityHeaders(
      await handler.fetch(request, { context: { host: "farm" } }),
      FARM_POLICY
    );
  },
});
