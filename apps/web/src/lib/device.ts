/**
 * What a Shed Phone remembers: its device token, the roster it checks PINs against, and who
 * is currently PIN-switched in (ADR 0003). All of it lives on the phone so PIN Switch works
 * with no signal; the PIN itself is never stored.
 */
const TOKEN_KEY = "openfarm.device.token";
const ROSTER_KEY = "openfarm.device.roster";
const ACTIVE_KEY = "openfarm.device.active";
const SWITCH_KEY = "openfarm.device.switch";
const PERSON_KEY = "openfarm.person";
const LOCK_KEY = "openfarm.device.lockMinutes";
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

/** The last value read, kept while what is stored has not changed: a screen subscribed to the phone's state must be
 *  handed the same object until it really changes, or it re-renders for ever. */
let activeRead: { raw: string | null; value: ActiveUser | null } = {
  raw: null,
  value: null,
};

export const getActiveUser = (): ActiveUser | null => {
  const raw = read(ACTIVE_KEY);
  if (raw === activeRead.raw) {
    return activeRead.value;
  }
  let value: ActiveUser | null = null;
  try {
    value = raw ? (JSON.parse(raw) as ActiveUser) : null;
  } catch {
    value = null;
  }
  activeRead = { raw, value };
  return value;
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

/** Proof that someone entered their PIN, issued by the server. The phone sends this rather
 *  than naming a person, so whoever holds a device token cannot act as anyone they like. */
export const getSwitchToken = (): string | null => read(SWITCH_KEY);
export const setSwitchToken = (token: string | null) =>
  write(SWITCH_KEY, token);

/** Who is signed in on a person's own phone, remembered so work recorded offline still carries their name. */
export const getSignedInPerson = (): string | null => read(PERSON_KEY);
export const setSignedInPerson = (userId: string | null) =>
  write(PERSON_KEY, userId);

/** How long this farm lets a Shed Phone sit untouched before it locks, as the farm last said. */
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
export const getAutoLockMinutes = (): number => {
  const saved = Number(read(LOCK_KEY));
  return Number.isFinite(saved) && saved > 0
    ? saved
    : DEFAULT_AUTO_LOCK_MINUTES;
};
export const setAutoLockMinutes = (minutes: number) =>
  write(LOCK_KEY, String(minutes));

/**
 * A PIN proved on the phone while it had no signal, held in memory only — never stored — so the switch can be
 * proved to the farm the moment signal comes back, without asking the person again mid-task.
 */
let unproved: { userId: string; pin: string } | null = null;
export const holdUnprovedSwitch = (
  proof: { userId: string; pin: string } | null
) => {
  unproved = proof;
};
export const takeUnprovedSwitch = () => {
  const proof = unproved;
  unproved = null;
  return proof;
};

/** Locks the phone on the phone: nobody is switched in, and no token names anyone. */
export const lockThisPhone = () => {
  unproved = null;
  setActiveUser(null);
  setSwitchToken(null);
};
