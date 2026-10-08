import {
  DefaultRetryPolicy,
  IndexedDBAdapter,
  WebLocksLeader,
  WebOnlineDetector,
} from "@tanstack/offline-transactions";

import { client } from "@/utils/orpc";

import {
  currentProof,
  getActiveUser,
  getDeviceToken,
  getSignedInPerson,
  getSwitchToken,
  tokenForProof,
} from "./device";
import type { ProofSettled, Transport } from "./outbox";
import { Outbox } from "./outbox";
import { proveHeldSwitches } from "./shed-phone";

/** The farm, as the Outbox speaks to it. Typed against the farm's own entry shapes rather than cast at them: this is
 *  the one seam where a field the server does not recognize would quietly lose a morning's work. It sends what it is
 *  given: a Batch is frozen before it gets here, so every attempt under one key carries the same entries. */
const farm: Transport = {
  send: (batch) => {
    const sending = {
      key: batch.key,
      sentAt: new Date(batch.sentAt),
      outboxId: batch.outboxId,
      entries: batch.entries,
    };
    // A Shed Phone locked on the shelf, its signal back, sends what it holds with nobody switched in: each entry carries
    // the token that proves its own person, so the work reaches the farm before the Manager takes it for undone.
    return getDeviceToken() && !getSwitchToken()
      ? client.sync.fromTheShelf(sending)
      : client.sync.batch(sending);
  },
};

/** What this phone may send now. A Shed Phone sends everybody's, each entry proving its own person. A person's own
 *  phone or the office computer sends only the work of whoever is signed in: work somebody else left queued under
 *  their own name waits for them to sign in again, rather than going under the wrong session and being refused. */
const mayCarry = (entry: { actorId?: string }): boolean =>
  Boolean(getDeviceToken()) ||
  entry.actorId === undefined ||
  entry.actorId === getSignedInPerson();

/**
 * What the proofs in a Batch being frozen are worth. Work recorded under a PIN entered with no signal goes under
 * that person's name only once the farm has seen the PIN, so the PINs go to the farm first; then each proof is
 * the token of the stint it was given for, a PIN the farm refused, or one a tab on this phone still holds — which
 * the Batch waits for rather than sending the work under nobody.
 */
const settleProofs = async (
  refs: readonly string[]
): Promise<Map<string, ProofSettled>> => {
  if (getDeviceToken()) {
    await proveHeldSwitches();
  }
  const settled = new Map<string, ProofSettled>();
  for (const ref of refs) {
    // Sequential: settling a proof is one answer for the whole phone at a time, and these are a handful of PINs.
    // oxlint-disable-next-line no-await-in-loop
    const { token, waiting } = await tokenForProof(ref);
    if (waiting) {
      settled.set(ref, "waiting");
      continue;
    }
    settled.set(ref, token ? { token } : "refused");
  }
  return settled;
};

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
    // Only how long to wait between tries: the Outbox never gives up on a Batch for want of signal (the Owner,
    // 2026-10-07), and hands one back only when the farm has looked at it and refused it.
    retry: new DefaultRetryPolicy(Number.POSITIVE_INFINITY, true),
    // Web Locks: two tabs open on the same phone would otherwise send the same entries
    // twice, under two keys, and the farm would have no way to know they were one thing.
    leader: new WebLocksLeader("openfarm-outbox"),
    online: new WebOnlineDetector(),
    // A Shed Phone's work is its switched-in person's; anywhere else it is the signed-in person's.
    actorOf: () =>
      getDeviceToken()
        ? (getActiveUser()?.userId ?? null)
        : getSignedInPerson(),
    proofOf: () => (getDeviceToken() ? currentProof() : null),
    mayCarry,
    settleProofs,
  });
  return outbox;
};
