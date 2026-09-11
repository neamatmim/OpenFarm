/**
 * The service worker exists so the app opens at all with no signal: the shell is cached on
 * install and served from the cache when the network cannot be reached.
 *
 * It deliberately does not cache API calls. Reads that matter offline are held by the app
 * itself, and every write goes through the Outbox — a service worker quietly replaying a
 * POST would be a second write path, which ADR 0002 rules out.
 */
const SHELL = "openfarm-shell-v1";
const SHELL_FILES = ["/", "/today", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(() => {
        // A file that will not cache is not a reason to refuse to install: the app still
        // works with signal, and the next install will try again.
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== SHELL).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only page navigations. Everything else — the API above all — goes to the network and is
  // allowed to fail, which is what the Outbox is for.
  if (request.mode !== "navigate") {
    return;
  }
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(SHELL);
      const cached = await cache.match(request);
      return cached ?? (await cache.match("/today")) ?? Response.error();
    })
  );
});
