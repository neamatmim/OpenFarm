// What the phone keeps of the app itself, build by build. The service worker keeps whatever the page happened to
// fetch, and route screens are separate files fetched when first opened: so after a deploy a shed screen not yet
// opened with signal was not on the phone, and the morning's milking could not be recorded. And nothing was ever let
// go, so each deploy left its files behind on a phone with little room.

/** The screens a phone in the shed must open with no signal, by route id. */
export const SHED_ROUTES = [
  "/_authenticated/home",
  "/_authenticated/work/",
  "/_authenticated/work/$instanceId",
  "/_authenticated/animals/",
  "/_authenticated/animals/$tagNumber",
  "/_authenticated/animals/$tagNumber/health",
  "/_authenticated/animals/$tagNumber/weigh-ins",
  "/_authenticated/sheds",
  "/_authenticated/outbox",
  "/shed-phone",
  "/today",
] as const;

type Link = string | { href: string };

/** The router's record of the files the page it served loads: enough to name the build, never all of it. */
export interface PageManifest {
  routes: Record<string, { preloads?: Link[] } | undefined>;
}

/** Which build this page is: its own first file, hashed, so a new deploy is a new name. Nothing in development. */
export const buildOf = (manifest: PageManifest | undefined): string | null => {
  const first = manifest?.routes.__root__?.preloads?.[0];
  if (!first) {
    return null;
  }
  const path = typeof first === "string" ? first : first.href;
  return path.startsWith("/assets/") ? path : null;
};

/** The router's own way to load a screen's files without opening it. */
interface ChunkLoader {
  routesById: object;
  // oxlint-disable-next-line typescript/no-explicit-any -- the router's own route type, which this file need not know
  loadRouteChunk: (route: any) => Promise<unknown> | undefined;
}

/** Tells the worker which build this is and waits for it to settle: a new build turns its kept files over. */
const tellTheWorker = async (build: string): Promise<void> => {
  const ready = await navigator.serviceWorker.ready;
  const worker = ready.active;
  if (!worker) {
    return;
  }
  const channel = new MessageChannel();
  // oxlint-disable-next-line promise/avoid-new -- a worker's reply is a message, with no promise of its own
  const settled = new Promise<void>((resolve) => {
    channel.port1.addEventListener("message", () => resolve());
    channel.port1.start();
    setTimeout(resolve, 10_000);
  });
  worker.postMessage({ kind: "this-build", build }, [channel.port2]);
  await settled;
};

/**
 * Once the page is up: tells the service worker which build this is, so it can let go of what builds before the last
 * one left, and then loads the shed's screens without opening them, so their files are on the phone before a person
 * walks into a shed with no signal. Nothing in development, which has no build.
 */
export const keepThisBuild = async (
  manifest: PageManifest | undefined,
  router: ChunkLoader
): Promise<void> => {
  const build = buildOf(manifest);
  if (!(build && navigator.serviceWorker)) {
    return;
  }
  try {
    await tellTheWorker(build);
    for (const id of SHED_ROUTES) {
      const route = (router.routesById as Record<string, unknown>)[id];
      if (route) {
        // One at a time, on a phone's one connection.
        // oxlint-disable-next-line no-await-in-loop
        await router.loadRouteChunk(route);
      }
    }
  } catch {
    // No worker or no signal: the next page load asks again, and the app still runs with signal.
  }
};
