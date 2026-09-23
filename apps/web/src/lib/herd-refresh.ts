/** How long the phone leaves the herd alone between reads. A herd does not change by the minute, and this runs on a
 *  battery the shed cannot charge. */
export const HERD_EVERY_MS = 10 * 60_000;

/** When the phone last read the herd, and when it last tried to. */
interface HerdReads {
  /** The last read that answered, which is what the phone is holding. */
  readAt: string | null;
  /** The last read it set out on, answered or not. */
  triedAt: string | null;
  now: number;
}

const msSince = (at: string | null, now: number): number | null => {
  if (!at) {
    return null;
  }
  const then = Date.parse(at);
  return Number.isNaN(then) ? null : now - then;
};

/**
 * Whether the phone reads the herd again on this tick.
 *
 * Counted from the last read it set out on, not only from the last one that answered: a person holding no Role yet
 * is refused this list, and a shed has no signal — so an attempt that brought nothing back is still an attempt, and
 * asking again on the next tick would be four times a minute for as long as the app is open.
 *
 * A time dated ahead of now is a clock that has moved, and is read as no time at all rather than as a wait of
 * however far it jumped.
 */
export const herdReadIsDue = ({ readAt, triedAt, now }: HerdReads): boolean => {
  const sinceEach = [msSince(readAt, now), msSince(triedAt, now)].filter(
    (since): since is number => since !== null && since >= 0
  );
  if (sinceEach.length === 0) {
    return true;
  }
  return Math.min(...sinceEach) > HERD_EVERY_MS;
};
