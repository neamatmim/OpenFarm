import type { RoleName } from "./roles";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long after an entry each Role may still put it right. Farm Parameters, because the
 * right answer depends on how the farm runs: a shift that ends at noon wants a window that
 * outlasts it. The Owner's and the Vet's are deliberately open-ended — the Owner answers for
 * the farm's records, and a Vet's clinical entry is theirs to correct for as long as the
 * animal's history matters.
 */
export interface CorrectionWindows {
  /** Staff may correct their own entries for this long. */
  staffHours: number;
  /** The Manager may correct anyone's for this long. */
  managerDays: number;
}

export const DEFAULT_CORRECTION_WINDOWS: CorrectionWindows = {
  staffHours: 2,
  managerDays: 30,
};

/** Why a Correction was refused, in terms the person can act on. */
export interface CorrectionRefusal {
  /** The Role whose window was tried. */
  role: RoleName;
  /** How long that Role gets, in words the message can use. */
  windowHours: number;
  /** Whether the Role may correct other people's entries at all. */
  ownEntriesOnly: boolean;
}

export type CorrectionVerdict =
  | { allowed: true; role: RoleName }
  | { allowed: false; refusal: CorrectionRefusal };

/** The windows each Role gets, in hours. Null means no limit. */
const windowHoursFor = (
  role: RoleName,
  windows: CorrectionWindows
): number | null => {
  if (role === "owner" || role === "vet") {
    return null;
  }
  if (role === "manager") {
    return windows.managerDays * 24;
  }
  return windows.staffHours;
};

/** Staff correct only what they entered; a Vet only their own clinical entries. */
const ownEntriesOnly = (role: RoleName): boolean =>
  role === "staff" || role === "vet";

/**
 * May this person put this entry right, and under which Role? The most permissive Role they
 * hold decides — someone who is both Manager and Staff corrects as the Manager, because that
 * is the authority they actually have. The Role that allowed it is returned so the Audit
 * Event records the one the correction was made under.
 */
export const mayCorrect = (
  {
    roles,
    isOwnEntry,
    recordedAt,
    now,
    windows,
  }: {
    roles: readonly RoleName[];
    /** Whether the entry being corrected is this person's own. */
    isOwnEntry: boolean;
    /** When the entry being corrected was made — the farm's clock, not the phone's. */
    recordedAt: Date;
    now: Date;
    windows: CorrectionWindows;
  },
  /** Ordered most permissive first, so the Role reported is the one that granted it. */
  precedence: readonly RoleName[] = ["owner", "manager", "vet", "staff"]
): CorrectionVerdict => {
  const age = now.getTime() - recordedAt.getTime();
  let best: CorrectionRefusal | null = null;
  for (const role of precedence) {
    if (!roles.includes(role)) {
      continue;
    }
    if (ownEntriesOnly(role) && !isOwnEntry) {
      continue;
    }
    const hours = windowHoursFor(role, windows);
    if (hours === null || age <= hours * HOUR_MS) {
      return { allowed: true, role };
    }
    // Remember the widest window they had, so the refusal names the one that ran out rather
    // than whichever Role happened to be checked last.
    if (!best || hours > best.windowHours) {
      best = { role, windowHours: hours, ownEntriesOnly: ownEntriesOnly(role) };
    }
  }
  return {
    allowed: false,
    refusal: best ?? {
      role: "staff",
      windowHours: windows.staffHours,
      ownEntriesOnly: true,
    },
  };
};

/** The instant an entry stops being correctable by a Role, for a screen that wants to say so
 *  before the person starts typing. Null when that Role has no limit. */
export const correctableUntil = (
  role: RoleName,
  recordedAt: Date,
  windows: CorrectionWindows
): Date | null => {
  const hours = windowHoursFor(role, windows);
  return hours === null
    ? null
    : new Date(recordedAt.getTime() + hours * HOUR_MS);
};

/** For a message that would rather say "30 days" than "720 hours". */
export const describeWindow = (
  windowHours: number
): { days: number } | { hours: number } =>
  windowHours >= 24 && windowHours % 24 === 0
    ? { days: windowHours / 24 }
    : { hours: windowHours };

export const DAY_IN_MS = DAY_MS;
