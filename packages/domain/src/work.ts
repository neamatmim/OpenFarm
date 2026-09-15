/** Every state an SOP Instance can be in. Mirrored from the database's column, which depends on nothing. */
export const INSTANCE_STATES = [
  "due",
  "in_progress",
  "completed",
  "approved",
  "sent_back",
  "missed",
  "called_off",
] as const;

export type InstanceState = (typeof INSTANCE_STATES)[number];

/**
 * What can happen to a piece of work, and the states it may happen from — the one place the farm's rule for an SOP
 * Instance is written. A transition from any other state is refused: late, when the work was closed or taken while the person
 * was doing it.
 */
export const WORK_TRANSITIONS = {
  /** Somebody takes the work: theirs until it is done or given to somebody else. Nobody may hold it already. */
  claim: { from: ["due", "in_progress", "sent_back"], to: "in_progress" },
  /** Its first Step recorded — or its first since it was sent back. */
  start: { from: ["due", "sent_back"], to: "in_progress" },
  /** A Step recorded on it at all: only on work still owed. Changes no state of its own. */
  record: { from: ["due", "in_progress", "sent_back"], to: null },
  /** Every Step done or skipped. */
  finish: { from: ["in_progress", "sent_back"], to: "completed" },
  /** Given to somebody, or back to its Role: who changes, not where the work stands. */
  assign: { from: ["due", "in_progress", "sent_back"], to: null },
  /** The checker agrees. Only work that has a checker. */
  approve: { from: ["completed"], to: "approved" },
  /** The checker does not, and says why. Only work that has a checker. */
  sendBack: { from: ["completed"], to: "sent_back" },
  /** The Manager closes overdue work with a reason (the glossary's Missed). */
  closeAsMissed: { from: ["due", "in_progress", "sent_back"], to: "missed" },
  /** What changed means the farm no longer owes it (the glossary's Called Off). Work done and awaiting sign-off stays. */
  callOff: { from: ["due", "in_progress", "sent_back"], to: "called_off" },
  /** Its cause came back. Work the Manager closed as Missed never does. */
  raiseAgain: { from: ["called_off"], to: "due" },
} as const satisfies Record<
  string,
  { from: readonly InstanceState[]; to: InstanceState | null }
>;

export type WorkTransition = keyof typeof WORK_TRANSITIONS;

/** Whether this transition may happen to work in this state. */
export const mayTransition = (
  transition: WorkTransition,
  state: string
): boolean =>
  (WORK_TRANSITIONS[transition].from as readonly string[]).includes(state);

/** The state a transition leaves the work in: its own, for a transition that changes who rather than where it stands. */
export const stateAfter = (
  transition: WorkTransition,
  state: InstanceState
): InstanceState => WORK_TRANSITIONS[transition].to ?? state;

/** Work still waiting to be done: what a Step may be recorded on. Overdue is not among them: it is not a state an
 *  Instance is put into but a fact about one of these and the clock, so nothing has to run on time for the farm to know
 *  the work is late. */
export const OPEN_INSTANCE_STATES = WORK_TRANSITIONS.record.from;

/** Work that has been done and is waiting for the checker Role — when it has one. */
export const AWAITING_SIGN_OFF = "completed" as const;

/** Whether the work waits for its checker: done, with a Role to sign it off. Work nobody checks is finished when done. */
export const awaitsSignOff = (work: {
  state: string;
  checkerRole: string | null;
}): boolean => work.state === AWAITING_SIGN_OFF && work.checkerRole !== null;

/** Done: completed or approved. Missed and Called Off are settled, not finished. */
export const isFinished = (state: string): boolean =>
  state === "completed" || state === "approved";

const MINUTE_MS = 60_000;

/** The longest Grace an SOP may declare. Bounds the sweep's query as well as the Version
 *  it validates, so the two cannot drift apart and leave late work unseen. */
export const MAX_GRACE_MINUTES = 24 * 60;

export const isOpen = (state: string): boolean =>
  (OPEN_INSTANCE_STATES as readonly string[]).includes(state);

/** The instant an Instance stops being merely due and starts being late. */
const overdueAt = (dueAt: Date, graceMinutes: number): Date =>
  new Date(dueAt.getTime() + graceMinutes * MINUTE_MS);

/** The instant the Owner is told as well. One rung: there is nowhere above the Owner. */
const escalatesAt = (
  dueAt: Date,
  graceMinutes: number,
  escalationMinutes: number
): Date =>
  new Date(
    overdueAt(dueAt, graceMinutes).getTime() + escalationMinutes * MINUTE_MS
  );

/** Enough of an Instance to say whether it is late: when it was due, and how long after
 *  that the farm allows before it counts. */
export interface DueWork {
  state: string;
  dueAt: Date;
  graceMinutes: number;
}

/** Late: open work past its due time and its grace. Closed work is never Overdue, however
 *  late it was done — the Audit Event holds when it actually happened. */
export const isOverdue = (instance: DueWork, now: Date): boolean =>
  isOpen(instance.state) &&
  now.getTime() >= overdueAt(instance.dueAt, instance.graceMinutes).getTime();

/** Still open long enough after going Overdue that the Owner should hear about it too. */
export const isEscalated = (
  instance: DueWork,
  escalationMinutes: number,
  now: Date
): boolean =>
  isOpen(instance.state) &&
  now.getTime() >=
    escalatesAt(
      instance.dueAt,
      instance.graceMinutes,
      escalationMinutes
    ).getTime();

/** How long an Instance has been late, in whole minutes; 0 before it is. */
export const minutesOverdue = (instance: DueWork, now: Date): number =>
  Math.max(
    0,
    Math.floor(
      (now.getTime() -
        overdueAt(instance.dueAt, instance.graceMinutes).getTime()) /
        MINUTE_MS
    )
  );
