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
 *  came before what an animal costs carried the Hasil, the Trips and the Herd Costs, and the one after it
 *  before her arrival said what the haat took, the one after that before the store said what the
 *  farm's own fodder is worth, and this one because a Venture now carries who has signed for it and what
 *  its account holds — a card drawn from the older shape had no figures to write out — and this one
 *  because every Money Event now names its Purse, the one after that because an Animal says whose she
 *  is, the one after that because a Venture says what its Cattle Budget is holding, and this one because
 *  an outing says what it was given and what it has bought, and this one because a Venture says what it
 *  has been paid for an Animal it let go. */
const CACHE_KEY = "kept-with-the-internal-sale";

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

/**
 * Keeps what the app has read on the device, so a phone with no signal opens on what it last
 * knew rather than on a spinner.
 *
 * This is the read half of working offline; the Outbox is the write half. Without it the pen
 * board has no Steps to show, no cows to tap and no button to claim with — and a milker
 * standing in a shed with no bars would have nothing to work from at all.
 */
const onDevice = (): Persister => {
  const storage = new IndexedDBAdapter("openfarm-queries", "cache");
  return {
    persistClient: async (client: PersistedClient) => {
      await storage.set(CACHE_KEY, writeKept(client));
    },
    restoreClient: async () => {
      const raw = await storage.get(CACHE_KEY);
      return raw ? readKept(raw) : undefined;
    },
    removeClient: async () => {
      await storage.delete(CACHE_KEY);
    },
  };
};

/** Starts keeping and restoring the cache. Browser only: the server renders the same
 *  components and has neither IndexedDB nor any need of them. */
export const keepQueriesOnDevice = (queryClient: QueryClient): void => {
  if (typeof window === "undefined") {
    return;
  }
  persistQueryClient({
    queryClient,
    persister: onDevice(),
    maxAge: KEEP_FOR_MS,
    dehydrateOptions: {
      // Only what has actually answered. A query that failed is not a picture of the farm.
      shouldDehydrateQuery: (query) => query.state.status === "success",
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
  await new IndexedDBAdapter("openfarm-queries", "cache").delete(CACHE_KEY);
};

/** Where one person's screens are put away on a Shed Phone while somebody else works on it. */
const shelfOf = (userId: string) => `person:${userId}`;

const cacheStore = () => new IndexedDBAdapter("openfarm-queries", "cache");

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
      buster: "",
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
    if (kept) {
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
