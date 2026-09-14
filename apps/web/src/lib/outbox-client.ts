import {
  DefaultRetryPolicy,
  IndexedDBAdapter,
  WebLocksLeader,
  WebOnlineDetector,
} from "@tanstack/offline-transactions";

import { client } from "@/utils/orpc";

import { getActiveUser, getDeviceToken, getSignedInPerson } from "./device";
import type { Transport } from "./outbox";
import { Outbox } from "./outbox";
import { proveHeldSwitches } from "./shed-phone";

/** The farm, as the Outbox speaks to it. Typed against the procedure rather than cast at it:
 *  this is the one seam where a field the server does not recognise would quietly lose a
 *  morning's work. */
const farm: Transport = {
  send: async (batch) => {
    // Work recorded under a PIN entered with no signal goes under that person's name only once the farm has seen
    // the PIN, so the PINs go first.
    if (getDeviceToken()) {
      await proveHeldSwitches();
    }
    return client.sync.batch({
      key: batch.key,
      sentAt: new Date(batch.sentAt),
      entries: batch.entries as Parameters<
        typeof client.sync.batch
      >[0]["entries"],
    });
  },
};

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
    transport: farm,
    retry: new DefaultRetryPolicy(MAX_ATTEMPTS, true),
    // Web Locks: two tabs open on the same phone would otherwise send the same entries
    // twice, under two keys, and the farm would have no way to know they were one thing.
    leader: new WebLocksLeader("openfarm-outbox"),
    online: new WebOnlineDetector(),
    // A Shed Phone's work is its switched-in person's; anywhere else it is the signed-in person's.
    actorOf: () =>
      getDeviceToken()
        ? (getActiveUser()?.userId ?? null)
        : getSignedInPerson(),
  });
  return outbox;
};
