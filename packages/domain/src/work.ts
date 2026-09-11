/** Work still waiting to be done. Overdue is not among them: it is not a state an Instance
 *  is put into but a fact about one of these three and the clock, so nothing has to run on
 *  time for the farm to know the work is late. */
export const OPEN_INSTANCE_STATES = [
  "due",
  "in_progress",
  "sent_back",
] as const;

/** Work that has been done and is waiting for the checker Role. */
export const AWAITING_SIGN_OFF = "completed" as const;

const MINUTE_MS = 60_000;

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
