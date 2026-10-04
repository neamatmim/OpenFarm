/**
 * How many audited writes this process has seen — every change to the farm's records goes through one — and the figures
 * worked out from a farm's whole history that are kept for as long as it has not moved.
 *
 * Moved when a write records its Audit Event, inside its transaction, and again once that transaction has committed: a
 * figure worked out while the write was open read the farm as it stood before it, and the second move retires it.
 */
let seen = 0;

export const aWriteWasSeen = (): void => {
  seen += 1;
};

/** A write's own transaction, the write seen again once it has committed — or failed, which costs a figure nothing. */
export const seenWhenDone = async <T>(transaction: Promise<T>): Promise<T> => {
  try {
    return await transaction;
  } finally {
    aWriteWasSeen();
  }
};

/** The figures kept, each as a farm's: what it is, and whose. */
export type KeptKind = "costs" | "feedStore";

const kept = new Map<string, { seen: number; value: Promise<unknown> }>();
const workedOut = new Map<KeptKind, number>();

/** How many times a kind of figure has been worked out afresh in this process: what a test counts. */
export const workedOutAfresh = (kind: KeptKind): number =>
  workedOut.get(kind) ?? 0;

/** A transaction, rather than the database: drizzle's has a `rollback`, the database has none. */
export const insideATransaction = (db: object): boolean => "rollback" in db;

/** Freezes a figure all the way down, into a map's values too, leaving dates as they are. */
const freezeAll = (value: unknown): void => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return;
  }
  if (value instanceof Date) {
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    for (const inner of value.values()) {
      freezeAll(inner);
    }
    return;
  }
  Object.freeze(value);
  for (const inner of Object.values(value)) {
    freezeAll(inner);
  }
};

/**
 * Worked out and, while the tests run, frozen, so a reader that sorted or pushed onto the copy every other reader shares
 * throws there rather than quietly changing everybody's figures. Not in production, where freezing a year's figures
 * would cost what keeping them saves.
 */
const workOutToKeep = async <T>(workOut: () => Promise<T>): Promise<T> => {
  const value = await workOut();
  if (process.env.VITEST) {
    freezeAll(value);
  }
  return value;
};

/** One that failed is not kept: the next asking tries again. */
const forgetIfItFails = async (key: string, value: Promise<unknown>) => {
  try {
    await value;
  } catch {
    if (kept.get(key)?.value === value) {
      kept.delete(key);
    }
  }
};

/**
 * A farm's figure worked out from its whole history, kept until the next write: asked again with nothing written since,
 * it is the same answer. Kept per process — the farm runs on one. Never for a transaction, which must read its own
 * rows: the caller works that out afresh (`insideATransaction`).
 */
export const keptUntilAWrite = <T>(
  kind: KeptKind,
  farmId: string,
  workOut: () => Promise<T>
): Promise<T> => {
  const key = `${kind}:${farmId}`;
  const held = kept.get(key);
  if (held && held.seen === seen) {
    return held.value as Promise<T>;
  }
  workedOut.set(kind, workedOutAfresh(kind) + 1);
  const value = workOutToKeep(workOut);
  kept.set(key, { seen, value });
  void forgetIfItFails(key, value);
  return value;
};
