/**
 * What a Shed Phone remembers: its device token, the roster it checks PINs against, and who
 * is currently PIN-switched in (ADR 0003). All of it lives on the phone so PIN Switch works
 * with no signal; the PIN itself is never stored.
 */
const TOKEN_KEY = "openfarm.device.token";
const ROSTER_KEY = "openfarm.device.roster";
const ACTIVE_KEY = "openfarm.device.active";
const CHANGED = "openfarm:device";

export interface RosterEntry {
  userId: string;
  name: string;
  salt: string;
  hash: string;
}

export interface ActiveUser {
  userId: string;
  name: string;
  /** When the phone last saw a tap; it locks once this is older than the farm's window. */
  lastSeenAt: number;
}

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // storage unavailable; the phone will ask again
  }
};

export const subscribeDevice = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
};

export const getDeviceToken = (): string | null => read(TOKEN_KEY);
export const setDeviceToken = (token: string | null) => write(TOKEN_KEY, token);

export const getRoster = (): RosterEntry[] => {
  const raw = read(ROSTER_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as RosterEntry[];
  } catch {
    return [];
  }
};
export const setRoster = (roster: RosterEntry[]) =>
  write(ROSTER_KEY, JSON.stringify(roster));

export const getActiveUser = (): ActiveUser | null => {
  const raw = read(ACTIVE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ActiveUser;
  } catch {
    return null;
  }
};
export const setActiveUser = (active: ActiveUser | null) =>
  write(ACTIVE_KEY, active === null ? null : JSON.stringify(active));

/** Records a tap so the phone does not lock under someone's hands. */
export const touchActiveUser = () => {
  const active = getActiveUser();
  if (active) {
    setActiveUser({ ...active, lastSeenAt: Date.now() });
  }
};

export const isLocked = (
  active: ActiveUser | null,
  autoLockMinutes: number
): boolean =>
  active === null || Date.now() - active.lastSeenAt > autoLockMinutes * 60_000;
