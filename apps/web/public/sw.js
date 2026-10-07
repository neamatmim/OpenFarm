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
const SHELL = "openfarm-shell-v11";
const ASSETS = "openfarm-assets-v3";
/** The files kept for the build before this one: let go when the next build comes. */
const PREVIOUS = "openfarm-assets-previous";
/** Which build ASSETS holds. */
const BUILDS = "openfarm-builds";
const KEEP = new Set([SHELL, ASSETS, PREVIOUS, BUILDS]);
const SHELL_FILES = ["/", "/work", "/manifest.webmanifest", "/icon.svg"];

/** One at a time, so one file that will not cache does not take the rest with it. */
const cacheEach = async (cache, urls) => {
  for (const url of urls) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one at a time, as said above
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

/** Files the development server serves under names that stay the same while their contents change. Cached first,
 *  they would show yesterday's styles and scripts for ever; they are left to the network. */
const isDevelopmentFile = (url) =>
  url.pathname.startsWith("/src/") ||
  url.pathname.startsWith("/@") ||
  url.pathname.startsWith("/node_modules/");

/** The app's own built files: hashed, so what is cached under a URL never changes meaning. */
const isBuildAsset = (url) =>
  url.origin === self.location.origin &&
  !isDevelopmentFile(url) &&
  (url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|css|woff2?|svg|png|webp)$/u.test(url.pathname));

const fromCacheFirst = async (request) => {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  // Kept for the last build and still wanted by this one: carried forward, so the next turn-over keeps it.
  const kept = await caches.open(PREVIOUS);
  const earlier = await kept.match(request);
  if (earlier) {
    await cache.put(request, earlier.clone());
    return earlier;
  }
  const answer = await fetch(request);
  if (answer.ok) {
    await cache.put(request, answer.clone());
  }
  return answer;
};

/** How long a page waits for the network before the kept page is shown instead: a connection that is up but crawling
 *  never fails, it only keeps a person at a blank screen in the shed (docs/research/next-improvements.md §2). */
const NAVIGATION_WAIT_MS = 4000;

/** Resolves to what it is given once the wait is over: a timer has no promise of its own in a service worker. */
const after = (ms, value) =>
  // oxlint-disable-next-line promise/avoid-new -- a timer made into a promise, the one way to race one
  new Promise((resolve) => {
    setTimeout(resolve, ms, value);
  });

/** Keeps the page the network gave, so the next time there is no signal the app opens on the build it last ran rather
 *  than on the one this worker was installed with — whose scripts a later deploy may have stopped reading the kept
 *  answers of. Only a page itself: never a redirect, an error, or an answer from somewhere else. */
const keepThePage = async (cache, request, answer) => {
  if (answer.ok && answer.type === "basic" && !answer.redirected) {
    await cache.put(request, answer.clone());
  }
};

/**
 * A page: the network's, as long as it answers within a few seconds; the kept page if it does not, or fails. With no
 * page kept, the network is waited for however long it takes, since there is nothing else to show. (A navigation
 * cannot be sent again with a signal to stop it: fetch refuses options for one.) Whatever the network answers, in time
 * or late, is kept for next time.
 */
const shellFor = async (request, event) => {
  const network = fetch(request);
  // Copied the moment it arrives, before the browser starts reading the one it is handed.
  // oxlint-disable-next-line prefer-await-to-then -- the copy must be taken before anything else reads the answer
  const copy = network.then((answer) => answer.clone());
  const cache = await caches.open(SHELL);
  event.waitUntil(
    (async () => {
      try {
        await keepThePage(cache, request, await copy);
      } catch {
        // No signal: the kept page stays as it was.
      }
    })()
  );
  const kept = (await cache.match(request)) ?? (await cache.match("/work"));
  if (!kept) {
    try {
      return await network;
    } catch {
      return Response.error();
    }
  }
  // A network that fails is answered by the kept page at once; one slower than the wait is not waited for, and its
  // failure later is nobody's error.
  const answered = async () => {
    try {
      return await network;
    } catch {
      return null;
    }
  };
  return (
    (await Promise.race([answered(), after(NAVIGATION_WAIT_MS, kept)])) ?? kept
  );
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  // Never the API: what the farm says is the app's business, and what the phone has to say
  // goes through the Outbox.
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(shellFor(request, event));
    return;
  }
  if (isBuildAsset(url)) {
    event.respondWith(fromCacheFirst(request));
  }
});

/** The build the files in ASSETS were kept for, written down so a new one can be told apart. */
const BUILD_NOTE = "/__openfarm-build";

/**
 * The page's word on which build it is (lib/keep-the-build.ts). A new one turns the kept files over: those kept for
 * the last build become the previous ones, and the build before that is let go — so each deploy no longer leaves its
 * files on a phone with little room, while a screen of the last build not yet opened again is still there with no
 * signal. A file still wanted is carried forward the first time it is asked for (fromCacheFirst).
 */
const turnOver = async (build) => {
  const notes = await caches.open(BUILDS);
  const noted = await notes.match(BUILD_NOTE);
  if (noted && (await noted.text()) === build) {
    return;
  }
  await caches.delete(PREVIOUS);
  const current = await caches.open(ASSETS);
  const previous = await caches.open(PREVIOUS);
  for (const request of await current.keys()) {
    // oxlint-disable-next-line no-await-in-loop -- a phone's few hundred files, one at a time
    const answer = await current.match(request);
    if (answer) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await previous.put(request, answer);
    }
  }
  await caches.delete(ASSETS);
  await notes.put(BUILD_NOTE, new Response(build));
};

self.addEventListener("message", (event) => {
  const said = event.data;
  const fromThisApp = !event.origin || event.origin === self.location.origin;
  if (
    !fromThisApp ||
    said?.kind !== "this-build" ||
    typeof said.build !== "string"
  ) {
    return;
  }
  event.waitUntil(
    (async () => {
      try {
        await turnOver(said.build);
      } finally {
        // The page waits for this before it loads the shed's screens, so they land among this build's files.
        event.ports[0]?.postMessage("settled");
      }
    })()
  );
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
      data: { url: notice.url ?? "/work" },
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
  const url = event.notification.data?.url ?? "/work";
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // The first window that can be focused is the one: it is focused, taken to the page, and the rest are left be.
      for (const client of open) {
        if ("focus" in client) {
          // oxlint-disable-next-line no-await-in-loop -- the loop ends here
          await client.focus();
          if ("navigate" in client) {
            // oxlint-disable-next-line no-await-in-loop -- the loop ends here
            await client.navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
