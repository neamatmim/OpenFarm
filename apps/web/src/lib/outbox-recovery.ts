import type { StorageAdapter } from "@tanstack/offline-transactions";

export class RecoveryError extends Error {
  readonly why: "not_yours" | "not_rejected" | "sending" | "missing_photos";
  constructor(why: RecoveryError["why"]) {
    super(`Could not recover entry: ${why}`);
    this.name = "RecoveryError";
    this.why = why;
  }
}

// Serialize recovery with sending. Tests and browsers without Web Locks also serialize a shared storage adapter.
const storageLocks = new WeakMap<StorageAdapter, Map<string, Promise<void>>>();

export const withOutboxLock = async <T>(
  storage: StorageAdapter,
  work: () => Promise<T>,
  name = "openfarm-outbox:recovery"
): Promise<T> => {
  let locks = storageLocks.get(storage);
  if (!locks) {
    locks = new Map();
    storageLocks.set(storage, locks);
  }
  const before = locks.get(name) ?? Promise.resolve();
  let release: (() => void) | undefined;
  // A mutex needs a completion signal owned by its current holder; it is resolved even when that holder fails.
  // oxlint-disable-next-line promise/avoid-new
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(name, turn);
  await before;
  try {
    if (globalThis.navigator?.locks) {
      return await navigator.locks.request(name, work);
    }
    return await work();
  } finally {
    release?.();
  }
};
