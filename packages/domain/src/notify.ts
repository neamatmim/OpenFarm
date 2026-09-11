import type { AlertKind } from "./alerts";

/**
 * How each kind of notice reaches a person, in one place.
 *
 * **Immediate** is the Alert proper: it goes now, into a pocket, through quiet hours,
 * because it costs money or breaks a legal deadline if it waits. **Digest** is everything
 * else — true, worth knowing, and no worse for arriving at six with the rest.
 *
 * Typed by the kind, so a new kind of notice cannot be added without somebody deciding
 * which of the two it is. That decision is the whole of the farm's notification table.
 */
export const DELIVERY: Record<AlertKind, "immediate" | "digest"> = {
  instance_overdue: "immediate",
  instance_escalated: "immediate",
  instance_sent_back: "immediate",
  needs_review: "digest",
  sop_published: "digest",
};

export const goesNow = (kind: AlertKind): boolean =>
  DELIVERY[kind] === "immediate";

export const waitsForTheDigest = (kind: AlertKind): boolean =>
  DELIVERY[kind] === "digest";

const MINUTES_PER_HOUR = 60;

/** "HH:MM" as minutes since the farm's midnight. */
export const minutesInTheDay = (time: string): number => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * MINUTES_PER_HOUR + minute;
};

export interface QuietHours {
  /** "22:00" — from this time of the farm's day. */
  from: string;
  /** "05:00" — until this time of the next one. */
  until: string;
}

/**
 * Is the farm asleep at this time of day? The window runs over midnight, which is the whole
 * point of it: nothing that can wait should buzz a phone at one in the morning.
 */
export const isQuiet = (minuteOfDay: number, quiet: QuietHours): boolean => {
  const from = minutesInTheDay(quiet.from);
  const until = minutesInTheDay(quiet.until);
  if (from === until) {
    return false;
  }
  return from < until
    ? minuteOfDay >= from && minuteOfDay < until
    : minuteOfDay >= from || minuteOfDay < until;
};

/**
 * The times of day the farm's post is actually carried, in minutes since its midnight.
 *
 * A digest time inside quiet hours is not a carrying moment: it waits for the farm to wake,
 * because a batch of things that could wait is exactly what quiet hours are for. Two digest
 * times that both fall asleep collapse into one waking moment, which is what a person would
 * expect — they are woken once.
 */
export const carryingMoments = (
  times: readonly string[],
  quiet: QuietHours
): number[] => {
  const moments = times.map((time) => {
    const at = minutesInTheDay(time);
    return isQuiet(at, quiet) ? minutesInTheDay(quiet.until) : at;
  });
  return [...new Set(moments)].toSorted((a, b) => a - b);
};

/**
 * The most recent moment the post should have been carried, at or before this minute of the
 * farm's day — or null if the day has not reached one yet, in which case yesterday's last
 * moment is what the caller should look back to.
 *
 * What makes this a digest rather than a running commentary: everything raised *before* that
 * moment goes now, and everything raised since waits for the next one.
 */
export const lastCarryingMoment = (
  minuteOfDay: number,
  times: readonly string[],
  quiet: QuietHours
): number | null => {
  const passed = carryingMoments(times, quiet).filter(
    (moment) => moment <= minuteOfDay
  );
  return passed.at(-1) ?? null;
};
