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
 *
 * What is stored is only what the entries need to be sent the same way every time, from any tab and after a reload:
 * that a stint's PIN is held (and when a tab holding it last said so), the token the farm gave for it, or that it
 * could not be proved.
 */
const HELD = "held:";
const PROOF_KEY = "openfarm.device.proof:";
const HELD_STINT_KEY = "openfarm.device.heldStint";
/** How long a held PIN counts as still held by some tab on this phone without that tab saying so again. */
const HELD_FRESH_MS = 2 * 60_000;
/** How long what was said about a stint is kept: as long as the phone keeps work at all. */
const PROOF_KEPT_MS = 14 * 24 * 60 * 60_000;

type ProofRecord =
  | { state: "held"; seenAt: number; at: number }
  | { state: "proved"; token: string; at: number }
  | { state: "unproved"; at: number };

/** Each stint worked on a PIN the farm has not yet seen, by the reference its entries carry — this tab's alone. */
const unproved = new Map<string, { userId: string; pin: string }>();

const readProof = (ref: string): ProofRecord | null => {
  try {
    const raw = read(`${PROOF_KEY}${ref}`);
    return raw ? (JSON.parse(raw) as ProofRecord) : null;
  } catch {
    return null;
  }
};
const writeProof = (ref: string, record: ProofRecord) =>
  write(`${PROOF_KEY}${ref}`, JSON.stringify(record));

const forgetOldProofs = () => {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PROOF_KEY)) {
        const record = readProof(key.slice(PROOF_KEY.length));
        if (!record || Date.now() - record.at > PROOF_KEPT_MS) {
          window.localStorage.removeItem(key);
        }
      }
    }
  } catch {
    // storage unavailable; nothing to tidy
  }
};

/** Holds a PIN entered with no signal, and starts the stint its work is recorded under. Every stint is its own: a
 *  second person switching in after the first does not lose the first person's proof — their work still needs it. */
export const holdUnprovedSwitch = (proof: { userId: string; pin: string }) => {
  forgetOldProofs();
  const ref = `${HELD}${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
  unproved.set(ref, proof);
  const now = Date.now();
  writeProof(ref, { state: "held", seenAt: now, at: now });
  write(HELD_STINT_KEY, ref);
  return ref;
};
/** The person switched in has been proved straight away: no stint is held for them. */
export const clearHeldStint = () => write(HELD_STINT_KEY, null);
export const heldSwitches = (): [string, { userId: string; pin: string }][] => [
  ...unproved,
];
/** This tab still holds these PINs: says so, so another tab sending the Outbox waits for them. */
export const touchHeldSwitches = () => {
  for (const ref of unproved.keys()) {
    const record = readProof(ref);
    writeProof(ref, {
      state: "held",
      seenAt: Date.now(),
      at: record?.at ?? Date.now(),
    });
  }
};
/** What the farm said about a held PIN: the token it gave, or null for a PIN it refused. */
export const markProved = (ref: string, token: string | null) => {
  unproved.delete(ref);
  writeProof(
    ref,
    token
      ? { state: "proved", token, at: Date.now() }
      : { state: "unproved", at: Date.now() }
  );
};
export const isHeldStint = (ref: string) => read(HELD_STINT_KEY) === ref;

/** What an entry recorded now carries as proof of who recorded it: the switch token, or the held stint's reference. */
export const currentProof = (): string | null =>
  getSwitchToken() ?? read(HELD_STINT_KEY);

/**
 * The switch token an entry's proof stands for, when it is sent. Waiting while its PIN is still to be proved by a tab
 * on this phone; nothing when the farm refused the PIN, or when no tab holds it any more — the phone was restarted
 * before it was proved. Once settled the answer is written down and never changes, so a batch sent again after a
 * lost reply is the same batch the farm already has.
 */
export const tokenForProof = (
  proof: string
): { token?: string; waiting: boolean } => {
  if (!proof.startsWith(HELD)) {
    return { token: proof, waiting: false };
  }
  const record = readProof(proof);
  if (record?.state === "proved") {
    return { token: record.token, waiting: false };
  }
  const stillHeld =
    unproved.has(proof) ||
    (record?.state === "held" && Date.now() - record.seenAt < HELD_FRESH_MS);
  if (stillHeld) {
    return { waiting: true };
  }
  if (record?.state !== "unproved") {
    writeProof(proof, { state: "unproved", at: Date.now() });
  }
  return { waiting: false };
};

/** Locks the phone on the phone: nobody is switched in, and no token names anyone. */
export const lockThisPhone = () => {
  clearHeldStint();
  setActiveUser(null);
  setSwitchToken(null);
};
