import type { Host } from "@OpenFarm/auth/hosts";
import { THUMB_MAX_BYTES } from "@OpenFarm/domain";
import { IndexedDBAdapter } from "@tanstack/offline-transactions";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/query-persist-client-core";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";
import { dehydrate, hydrate } from "@tanstack/react-query";

/** A fortnight. A phone can be out of signal for days, and what it read before that is the
 *  only picture of the farm it has. */
const KEEP_FOR_MS = 14 * 24 * 60 * 60 * 1000;
/** Named again when what is kept changes shape, so a phone never reads back a cache written the old way: the first
 *  one kept every date as a string, and a page drawn from it failed on the first date it wrote out; the next one
 *  came before what an animal costs carried the Market toll, the Trips and the Herd Costs, and the one after it
 *  before her arrival said what the livestock market took, the one after that before the store said what the
 *  farm's own fodder is worth, and this one because a Venture now carries who has signed for it and what
 *  its account holds — a card drawn from the older shape had no figures to write out — and this one
 *  because every Money Event now names its Purse, the one after that because an Animal says whose she
 *  is, the one after that because a Venture says what its Cattle Budget is holding, and this one because
 *  an outing says what it was given and what it has bought, and this one because a Venture says what it
 *  has been paid for an Animal it let go, and this one because a month's Reimbursement says what it is
 *  made of, the one after that because a Venture says what it owes the Owner and whether it is running
 *  low, the one after that because it says whether the bank agreed, the one after that because every sum
 *  of money is named for money, not for the taka it is counted in, the one after that because what a
 *  buyer still owes is a Receivable, not a Baki, the one after that because a haat is a Livestock
 *  Market, the one after that because bKash money is Mobile Money, the one after that because the Hasil
 *  is the Market Toll, the one after that because a Dispatch's challan is its Delivery Note, and this one
 *  because a query is kept under its router's name, and the routers are named for what they serve, and this
 *  one because the work, the Buying Trips, the Sheds, the Inspector View and the Owner's overview have their own,
 *  the one after that because a read of one thing is `get`, of many `list`, and an Animal is read by
 *  `animals.get`, the one after that because feed come into the store is the Feed In, `stock.feedIn`, and
 *  the one after that because a router holding more than one kind of thing nests one per kind:
 *  `feed.items.list`, and this one because a Venture's do too: `ventures.agreements.list`. */
const CACHE_KEY = "kept-with-nested-ventures";
/** The shape of what this phone keeps, written on everything it puts away, so nothing put away the old way is read. */
export const CACHE_SHAPE = CACHE_KEY;

/** The database the kept cache lives in, on this address. */
const KEPT_DATABASE = "openfarm-queries";

/** Where the kept cache, and each person's put-away screens, are written. */
const cacheStore = () => new IndexedDBAdapter(KEPT_DATABASE, "cache");

/** How a date is written into the kept cache, so it is read back as a date rather than as the string JSON makes of
 *  it. The API's answers carry real dates, and every screen formats them as dates. */
const DATE_MARK = "$date";

/** Written: a date as `{ $date: "…" }`. `this[key]` is the value before JSON has turned the date into a string. */
const keepDates = function keepDates(
  this: Record<string, unknown>,
  key: string,
  value: unknown
) {
  const raw = this[key];
  return raw instanceof Date ? { [DATE_MARK]: raw.toISOString() } : value;
};

/** Read back: `{ $date: "…" }` as the date it was. */
const readDates = (_key: string, value: unknown) =>
  value !== null &&
  typeof value === "object" &&
  DATE_MARK in value &&
  typeof value[DATE_MARK] === "string"
    ? new Date(value[DATE_MARK])
    : value;

/** The kept cache as it is written to the device, dates marked so they come back as dates. */
export const writeKept = (client: PersistedClient): string =>
  JSON.stringify(client, keepDates);

/** The kept cache as it is read back from the device. */
export const readKept = (raw: string): PersistedClient =>
  JSON.parse(raw, readDates) as PersistedClient;

/** Where the kept cache is written: the device's database, or a stand-in for it. */
type KeptStorage = Pick<IndexedDBAdapter, "get" | "set" | "delete">;

/**
 * What was kept, as it is read back: every answer in it to be asked again as soon as a screen shows it. It is drawn at
 * once — a phone with no signal opens on what it last knew — but it is not taken as the farm's answer today. Kept
 * with the time it was fetched, an answer under a minute old counted as fresh, so a reload asked the farm nothing and
 * showed a list from before what somebody else had just saved on their own phone.
 */
const toBeAskedAgain = (kept: PersistedClient): PersistedClient => ({
  ...kept,
  clientState: {
    ...kept.clientState,
    queries: kept.clientState.queries.map((query) => ({
      ...query,
      state: { ...query.state, isInvalidated: true },
    })),
  },
});

/** What writes the waiting cache out as the page is left, and whether the page is listened to for that yet. */
let writeOnLeaving: (() => Promise<void>) | null = null;
let listeningForLeaving = false;

/** How long a change waits before the cache is written out, so a page that answers twenty queries at once is one
 *  write, not twenty: every write turns the whole fortnight into one string on the phone's only thread. */
export const KEEP_AT_MOST_EVERY_MS = 1000;

/**
 * Keeps what the app has read on the device, so a phone with no signal opens on what it last
 * knew rather than on a spinner.
 *
 * This is the read half of working offline; the Outbox is the write half. Without it the pen
 * board has no Steps to show, no cows to tap and no button to claim with — and a milker
 * standing in a shed with no bars would have nothing to work from at all. A change waits a moment before it is
 * written, and only the last of a burst is.
 */
export const onDevice = (
  storage: KeptStorage = cacheStore(),
  wait: number = KEEP_AT_MOST_EVERY_MS
): Persister => {
  let latest: PersistedClient | null = null;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  const writeOut = async () => {
    waiting = null;
    const client = latest;
    latest = null;
    if (client) {
      await storage.set(CACHE_KEY, writeKept(client));
    }
  };
  // Leaving the page writes what is waiting, so the last second's answers are not lost to a closed tab — through one
  // listener for the page, whichever persister was made last.
  writeOnLeaving = writeOut;
  if (typeof window !== "undefined" && !listeningForLeaving) {
    listeningForLeaving = true;
    window.addEventListener("pagehide", () => {
      void writeOnLeaving?.();
    });
  }
  return {
    persistClient: (client: PersistedClient) => {
      latest = client;
      waiting ??= setTimeout(() => {
        void writeOut();
      }, wait);
      return Promise.resolve();
    },
    restoreClient: async () => {
      const raw = await storage.get(CACHE_KEY);
      return raw ? toBeAskedAgain(readKept(raw)) : undefined;
    },
    removeClient: async () => {
      await storage.delete(CACHE_KEY);
    },
  };
};

/** Whether an answer is an Investor's, read in the portal: the procedure's path starts with `portal`. */
const isPortalQuery = (queryKey: readonly unknown[]): boolean => {
  const [path] = queryKey;
  return Array.isArray(path) && path[0] === "portal";
};

/** The reads that answer with a photo whole: a death's photos, the certificate, a receipt, and an Animal's photo
 *  unless it was asked for as her thumbnail. Each is fetched again when it is opened; kept, a herd's photos would make
 *  the fortnight's cache tens of megabytes, written out again on every change. */
const WHOLE_PHOTOS = new Set([
  "animals.deathPhotos",
  "animals.voidedPhotos",
  "farm.certificate",
  "money.receipt",
]);

/** An object's own fields, for reading a query's key and answer without asserting their shape. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** What an answer of `animals.photo` holds as its picture: its base64, when it holds one. */
const pictureOf = (data: unknown): string | null =>
  isRecord(data) && typeof data.data === "string" ? data.data : null;

/**
 * Whether an answer is a photo whole. An Animal's photo asked for as her thumbnail is one too when it came back whole:
 * a photo taken before thumbnails were made is sent whole either way, so the answer, not the asking, is weighed.
 */
const isWholePhoto = (query: {
  queryKey: readonly unknown[];
  state: { data?: unknown };
}): boolean => {
  const [path, options] = query.queryKey;
  if (!Array.isArray(path)) {
    return false;
  }
  const name = path.join(".");
  if (WHOLE_PHOTOS.has(name)) {
    return true;
  }
  if (name !== "animals.photo") {
    return false;
  }
  const input =
    isRecord(options) && isRecord(options.input) ? options.input : null;
  const picture = pictureOf(query.state.data);
  return (
    input?.size !== "thumb" ||
    (picture !== null && picture.length > THUMB_MAX_BYTES)
  );
};

/**
 * Whether an answer is kept on the device: only what actually answered — a query that failed is not a picture of the
 * farm — never a photo whole (an Animal's thumbnail is kept, so a shed with no signal still shows her face), and never
 * an Investor's. An Investor has no shed with no signal to read in, and their capital, their record
 * and their papers left on a phone for a fortnight after they sign out are anybody's who picks it up (the exposure
 * review, 2.5; ASVS 14.3.1). On the portal's own address nothing is kept at all, whoever's it is (ADR 0009).
 */
export const keptOnDevice = (
  query: {
    queryKey: readonly unknown[];
    state: { status: string; data?: unknown };
  },
  host: Host
): boolean =>
  host === "farm" &&
  query.state.status === "success" &&
  !isWholePhoto(query) &&
  !isPortalQuery(query.queryKey);

/**
 * Takes away the database the kept cache lives in, whatever an older visit left there — deleted rather than emptied,
 * since opening it to empty it would make one where there was none.
 */
const forgetKeptDatabase = () => {
  try {
    indexedDB.deleteDatabase(KEPT_DATABASE);
  } catch {
    // No storage on this phone: nothing kept to forget.
  }
};

/**
 * Starts keeping and restoring the cache — on the farm's address. On the portal's own it keeps nothing, and forgets
 * whatever an older visit left there (ADR 0009). Browser only: the server renders the same components and has neither
 * IndexedDB nor any need of them.
 */
export const keepQueriesOnDevice = (
  queryClient: QueryClient,
  host: Host
): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (host === "portal") {
    forgetKeptDatabase();
    return;
  }
  persistQueryClient({
    queryClient,
    persister: onDevice(),
    maxAge: KEEP_FOR_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => keptOnDevice(query, host),
    },
  });
};

/**
 * Forgets everything this phone has read. Called when the person at the handset changes.
 *
 * A Shed Phone is one device that several people work from, and what it has cached was read
 * as whoever was PIN-switched in at the time — their work, their Alerts, what they had
 * already been told. Handing that to the next milker is one person's screen showing another
 * person's business, and it is a shed phone, so it happens every milking.
 */
export const forgetWhatThisPhoneRead = async (
  queryClient: QueryClient
): Promise<void> => {
  queryClient.clear();
  if (typeof window === "undefined") {
    return;
  }
  await cacheStore().delete(CACHE_KEY);
};

/** Whether a person's screens were put away in the shape this phone reads now: one put away before an update changed
 *  that shape is left where it is, and their screens fill from the farm instead. */
export const shelvedInThisShape = (kept: PersistedClient): boolean =>
  kept.buster === CACHE_SHAPE;

/** Where one person's screens are put away on a Shed Phone while somebody else works on it. */
const shelfOf = (userId: string) => `person:${userId}`;

/**
 * Puts away what this phone has read for the person leaving it, under their name alone, then clears the screen for
 * whoever comes next. What was read as one milker never shows on another milker's screen — but the milker who comes
 * back to the phone, perhaps in a shed with no signal, finds their own work where they left it.
 */
export const putAwayFor = async (
  queryClient: QueryClient,
  userId: string | null | undefined
): Promise<void> => {
  if (typeof window !== "undefined" && userId) {
    const kept = {
      timestamp: Date.now(),
      buster: CACHE_SHAPE,
      clientState: dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => query.state.status === "success",
      }),
    };
    try {
      await cacheStore().set(shelfOf(userId), writeKept(kept));
    } catch {
      // No room on the phone: they start from the farm again, as they would have before.
    }
  }
  await forgetWhatThisPhoneRead(queryClient);
};

/** Hands the phone from one person to the next: the leaver's screens put away, the arriver's own brought back. */
export const handOverThisPhone = async (
  queryClient: QueryClient,
  from: string | null | undefined,
  to: string
): Promise<void> => {
  await putAwayFor(queryClient, from);
  if (typeof window === "undefined") {
    return;
  }
  try {
    const raw = await cacheStore().get(shelfOf(to));
    const kept = raw ? readKept(raw) : null;
    if (kept && shelvedInThisShape(kept)) {
      // Only what was actually read from the farm in the last fortnight: putting a screen away and bringing it back
      // does not make what is on it any newer.
      const fresh = kept.clientState.queries.filter(
        (query) => Date.now() - query.state.dataUpdatedAt < KEEP_FOR_MS
      );
      hydrate(queryClient, { ...kept.clientState, queries: fresh });
    }
  } catch {
    // Nothing usable put away for them: the screen fills from the farm.
  }
};
