/**
 * Wrong PINs typed on a Shed Phone with no signal, counted by the phone itself: the farm's own count never sees them,
 * and with none of its own the phone could be kept in airplane mode and guessed at for ever. Five for one person in
 * fifteen minutes, as the farm counts them — kept on the phone, so a restart does not wipe the count.
 */

/** What the phone keeps a count in: its local storage, or anything shaped like it. */
interface Kept {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const LIMIT = 5;
const WINDOW_MS = 15 * 60_000;
const KEY = (userId: string) => `openfarm.offline-pin.${userId}`;

/** The phone's own storage, where it has one: a private window or a blocked one counts nothing, which is no worse. */
const theDevice = (): Kept | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** When this person's wrong PINs were typed, within the window. */
const recent = (userId: string, now: number, kept: Kept | null): number[] => {
  try {
    const raw = kept?.getItem(KEY(userId));
    const at = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(at)
      ? at.filter(
          (one): one is number =>
            typeof one === "number" && now - one < WINDOW_MS
        )
      : [];
  } catch {
    return [];
  }
};

/** Whether this person's PIN is not to be tried here for now. */
export const offlineLockedOut = (
  userId: string,
  now: number,
  kept: Kept | null = theDevice()
): boolean => recent(userId, now, kept).length >= LIMIT;

/** One guess counted against this person, before it is checked: counted first, as the farm counts them. */
export const countOfflineGuess = (
  userId: string,
  now: number,
  kept: Kept | null = theDevice()
): void => {
  try {
    kept?.setItem(
      KEY(userId),
      JSON.stringify([...recent(userId, now, kept), now])
    );
  } catch {
    // Nowhere to keep it: counted nowhere.
  }
};

/** Forgets a person's wrong guesses once they have their PIN right. */
export const forgetOfflineGuesses = (
  userId: string,
  kept: Kept | null = theDevice()
): void => {
  try {
    kept?.removeItem(KEY(userId));
  } catch {
    // Nowhere it was kept.
  }
};
