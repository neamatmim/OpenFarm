import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const withSecurityHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // Only the parts of a policy that cannot break the app: no plugins, no framing, no rewriting where relative
  // links point, forms sent only to the farm. Scripts are left alone — the theme and the server render write
  // inline ones — so this is not a defence against injected script, only against the page being borrowed.
  headers.set(
    "content-security-policy",
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
  );
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

export default createServerEntry({
  fetch: async (request) => withSecurityHeaders(await handler.fetch(request)),
});
