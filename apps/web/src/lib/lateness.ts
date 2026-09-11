const MINUTES_PER_HOUR = 60;

/** How late something is, in whole hours, for a message that says "late by N hours". Always
 *  at least one: the notice only exists because it is late, and "late by 0 hours" reads as
 *  a bug rather than as a small delay. */
export const hoursLate = (minutes: number): number =>
  Math.max(1, Math.round(minutes / MINUTES_PER_HOUR));
