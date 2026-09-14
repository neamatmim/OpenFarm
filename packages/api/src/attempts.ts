/**
 * Wrong guesses, counted in memory: a PIN, an enrolment code, an invitation code. Four digits are ten thousand
 * guesses, and a script makes them in a minute; five wrong in a quarter of an hour is a person having a bad morning,
 * and more is not. Kept per server process — a restart forgets, which is the right side to err on for a farm with
 * one server — and never written to the database, because a count of mistakes is not a farm record.
 */
const failures = new Map<string, number[]>();

export interface AttemptRule {
  limit: number;
  windowMs: number;
}

export const PIN_ATTEMPTS: AttemptRule = { limit: 5, windowMs: 15 * 60_000 };
export const CODE_ATTEMPTS: AttemptRule = { limit: 10, windowMs: 15 * 60_000 };

const recent = (key: string, now: Date, rule: AttemptRule): number[] => {
  const since = now.getTime() - rule.windowMs;
  const kept = (failures.get(key) ?? []).filter((at) => at > since);
  if (kept.length === 0) {
    failures.delete(key);
  } else {
    failures.set(key, kept);
  }
  return kept;
};

/** Whether this key has used up its wrong guesses for now. */
export const lockedOut = (key: string, now: Date, rule: AttemptRule): boolean =>
  recent(key, now, rule).length >= rule.limit;

export const countFailure = (
  key: string,
  now: Date,
  rule: AttemptRule
): void => {
  failures.set(key, [...recent(key, now, rule), now.getTime()]);
};

export const forgetFailures = (key: string): void => {
  failures.delete(key);
};
