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
  queryKey: ["herd-cache"] as const,
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
