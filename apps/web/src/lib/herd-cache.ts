import { IndexedDBAdapter } from "@tanstack/offline-transactions";
import type { StorageAdapter } from "@tanstack/offline-transactions";

/** What a phone needs to know about an animal to work a Pen with no signal: which cow, what
 *  she looks like, and whether her milk may go to the tank. */
export interface CachedAnimal {
  id: string;
  tagNumber: string;
  state: string;
  penId: string;
  photoUpdatedAt: string | null;
  milkWithdrawalUntil: string | null;
}

const HERD = "herd";
const CACHED_AT = "herd:at";
const TRIED_AT = "herd:tried";

let store: StorageAdapter | null = null;
const herdStore = (): StorageAdapter | null => {
  if (typeof window === "undefined") {
    return null;
  }
  store ??= new IndexedDBAdapter("openfarm-herd", "animals");
  return store;
};

/**
 * Keeps the animals of the Pens this person works, at every sync.
 *
 * A Gate is rendered from this when there is no signal: a cow under Withdrawal has to show
 * as locked in a shed with no bars, because that is exactly where the mistake gets made. The
 * server decides again when the entry lands — this is what the phone shows, not what the
 * farm believes.
 */
export const rememberHerd = async (
  animals: CachedAnimal[],
  at: Date
): Promise<void> => {
  const storage = herdStore();
  if (!storage) {
    return;
  }
  await storage.set(HERD, JSON.stringify(animals));
  await storage.set(CACHED_AT, at.toISOString());
};

/** That the phone set out to read the herd, answered or not. Kept apart from what it holds: a read that brought
 *  nothing back changes when the next one is due and nothing else. */
export const rememberHerdTried = async (at: Date): Promise<void> => {
  await herdStore()?.set(TRIED_AT, at.toISOString());
};

/** When the phone last set out to read the herd. */
export const herdLastTried = async (): Promise<string | null> =>
  (await herdStore()?.get(TRIED_AT)) ?? null;

export const cachedHerd = async (): Promise<{
  animals: CachedAnimal[];
  at: string | null;
}> => {
  const storage = herdStore();
  if (!storage) {
    return { animals: [], at: null };
  }
  const [raw, at] = await Promise.all([
    storage.get(HERD),
    storage.get(CACHED_AT),
  ]);
  return {
    animals: raw ? (JSON.parse(raw) as CachedAnimal[]) : [],
    at,
  };
};

/**
 * The one question for what this phone last knew of the herd. Everything that reads it asks this, and picks what it
 * needs with `select`: two questions under one key, answered in different shapes, handed the top bar the whole herd
 * where it expected the time it was kept, and the page fell over formatting it as a date.
 */
export const herdCacheQuery = {
  // Not ["herd-cache"]: a phone keeps its answers for a fortnight, and under that key it may still hold the time
  // alone, from before the two questions became one. Read as the herd, that string's own `.at` is a function.
  queryKey: ["herd-cache", "herd"] as const,
  queryFn: cachedHerd,
  staleTime: Number.POSITIVE_INFINITY,
};

/** Is this cow's milk held back, as far as this phone knows? */
export const cachedWithdrawal = (
  animal: Pick<CachedAnimal, "milkWithdrawalUntil"> | undefined,
  now: Date
): boolean =>
  Boolean(
    animal?.milkWithdrawalUntil &&
    new Date(animal.milkWithdrawalUntil).getTime() > now.getTime()
  );
