/**
 * The service worker exists so the app opens at all with no signal.
 *
 * It caches two things: the page shell, and every same-origin build asset the app asks for
 * as it runs. The second is the part that matters — a cached page that cannot reach its own
 * JavaScript is a blank screen, which is worse than an honest error.
 *
 * It deliberately caches no API call. Reads that matter offline are kept by the app itself,
 * and every write goes through the Outbox; a service worker quietly replaying a POST would
 * be a second write path, which ADR 0002 rules out.
 */
const SHELL = "openfarm-shell-v2";
const ASSETS = "openfarm-assets-v2";
const KEEP = new Set([SHELL, ASSETS]);
const SHELL_FILES = ["/", "/today", "/manifest.webmanifest", "/icon.svg"];

/** One at a time, so one file that will not cache does not take the rest with it. */
const cacheEach = async (cache, urls) => {
  for (const url of urls) {
    try {
      await cache.add(url);
    } catch {
      // A page that redirects when signed out, say. The rest of the shell still caches, and
      // the next install tries again.
    }
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cacheEach(cache, SHELL_FILES);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !KEEP.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/** The app's own built files: hashed, so what is cached under a URL never changes meaning. */
const isBuildAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|css|woff2?|svg|png|webp)$/u.test(url.pathname));

const fromCacheFirst = async (request) => {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const answer = await fetch(request);
  if (answer.ok) {
    await cache.put(request, answer.clone());
  }
  return answer;
};

const shellFor = async (request) => {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(request);
    return cached ?? (await cache.match("/today")) ?? Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  // Never the API: what the farm says is the app's business, and what the phone has to say
  // goes through the Outbox.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rpc")) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(shellFor(request));
    return;
  }
  if (isBuildAsset(url)) {
    event.respondWith(fromCacheFirst(request));
  }
});

/**
 * A notice from the farm, shown while the app is closed. The body is already written in the
 * reader's own language — the farm knows who it is speaking to, and the browser does not.
 */
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }
  let notice;
  try {
    notice = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(notice.title ?? "OpenFarm", {
      body: notice.body ?? "",
      // One notice per thing: a phone in a pocket all morning should show what is waiting,
      // not a history of being told.
      tag: notice.tag,
      renotify: Boolean(notice.tag),
      data: { url: notice.url ?? "/today" },
      icon: "/icon.svg",
      badge: "/icon.svg",
      // The farm wrote these words and knows whose they are; the browser does not.
      lang: notice.lang ?? "bn",
    })
  );
});

/** A tap goes to the work it is about — reusing the window that is already open, because a
 *  phone with six copies of the app open is a phone nobody can work from. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/today";
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of open) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
