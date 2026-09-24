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

/** How many keys may be held before the old ones are swept: a farm's own mistakes never come near it, a script
 *  naming a new phone or caller every time soon would. */
const SWEEP_WHEN_HOLDING = 1000;

/** Every rule a guess is counted by. A rule left off this list would have its keys swept before their window ends. */
const RULES: readonly AttemptRule[] = [PIN_ATTEMPTS, CODE_ATTEMPTS];

/** The longest any rule remembers a guess: a key whose newest guess is older is remembered by nothing. */
const LONGEST_WINDOW_MS = Math.max(...RULES.map((rule) => rule.windowMs));

/** Forgets every key nothing remembers any more. A key is pruned when it is asked about; one never asked about again
 *  — a phone a script named once — would otherwise stay until the process ends. */
const sweep = (now: Date): void => {
  const since = now.getTime() - LONGEST_WINDOW_MS;
  for (const [key, at] of failures) {
    if ((at.at(-1) ?? 0) <= since) {
      failures.delete(key);
    }
  }
};

export const countFailure = (
  key: string,
  now: Date,
  rule: AttemptRule
): void => {
  failures.set(key, [...recent(key, now, rule), now.getTime()]);
  if (failures.size > SWEEP_WHEN_HOLDING) {
    sweep(now);
  }
};

/** How many keys are being remembered, for a test that memory stays bounded. */
export const keysHeld = (): number => failures.size;

export const forgetFailures = (key: string): void => {
  failures.delete(key);
};
