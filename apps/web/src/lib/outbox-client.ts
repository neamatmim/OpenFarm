import {
  DefaultRetryPolicy,
  IndexedDBAdapter,
  WebLocksLeader,
  WebOnlineDetector,
} from "@tanstack/offline-transactions";

import { client } from "@/utils/orpc";

import { Outbox } from "./outbox";

/** How many times a batch is offered before its entries are handed back to the person. A
 *  phone can be out of signal for days, so this is generous; what it is not is forever. */
const MAX_ATTEMPTS = 12;

let outbox: Outbox | null = null;

/**
 * The one Outbox this phone has. Made lazily and in the browser only: the pieces it stands
 * on — IndexedDB, Web Locks, the online event — exist nowhere else, and the server renders
 * the same components.
 */
export const phoneOutbox = (): Outbox | null => {
  if (typeof window === "undefined") {
    return null;
  }
  outbox ??= new Outbox({
    storage: new IndexedDBAdapter("openfarm-outbox", "entries"),
    transport: {
      send: (batch) =>
        client.sync.batch(
          batch as unknown as Parameters<typeof client.sync.batch>[0]
        ) as Promise<{ results: never[] }>,
    },
    retry: new DefaultRetryPolicy(MAX_ATTEMPTS, true),
    // Web Locks: two tabs open on the same phone would otherwise send the same entries
    // twice, under two keys, and the farm would have no way to know they were one thing.
    leader: new WebLocksLeader("openfarm-outbox"),
    online: new WebOnlineDetector(),
  });
  return outbox;
};
