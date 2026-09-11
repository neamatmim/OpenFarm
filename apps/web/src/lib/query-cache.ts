import { IndexedDBAdapter } from "@tanstack/offline-transactions";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/query-persist-client-core";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";

/** A fortnight. A phone can be out of signal for days, and what it read before that is the
 *  only picture of the farm it has. */
const KEEP_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const CACHE_KEY = "queries";

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
      await storage.set(CACHE_KEY, JSON.stringify(client));
    },
    restoreClient: async () => {
      const raw = await storage.get(CACHE_KEY);
      return raw ? (JSON.parse(raw) as PersistedClient) : undefined;
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
