import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const withSecurityHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
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
