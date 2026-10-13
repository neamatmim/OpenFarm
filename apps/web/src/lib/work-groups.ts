import { farmDayOf, isFinished } from "@OpenFarm/domain";

/** How long before its time work counts as now: a milker starting the feed a little early is doing today's work, not
 *  the evening's. Everything raised for later in the day stays startable, only further down. */
const NEAR_MS = 60 * 60_000;

/** States in which somebody is already on the work, or it came back to them: now, whenever it falls due. */
const UNDER_WAY: ReadonlySet<string> = new Set(["in_progress", "sent_back"]);

/** Enough of a piece of today's work to say where it goes on the list and whose it is. */
export interface ListedWork {
  id: string;
  state: string;
  dueAt: Date | string;
  overdue: boolean;
  penId: string | null;
  assignedTo: string | null;
  claimedBy: string | null;
}

/** Whether the work belongs under now: late, under way, or falling due within the hour. */
const isNow = (one: ListedWork, now: Date): boolean =>
  one.overdue ||
  UNDER_WAY.has(one.state) ||
  new Date(one.dueAt).getTime() <= now.getTime() + NEAR_MS;

/**
 * The day's owed work split by when it is wanted: now — late, under way, or due within the hour — and later today.
 * Work this phone has finished is owed no longer — its Finish still in the Outbox, or sent on and held as finished
 * until the list is read again — and is handed back on its own so the list can count it done before the farm has said.
 */
export const groupTheDay = <W extends ListedWork>(
  work: readonly W[],
  { now, finishedHere }: { now: Date; finishedHere: ReadonlySet<string> }
): { now: W[]; later: W[]; finishedHere: W[] } => {
  const day = { now: [] as W[], later: [] as W[], finishedHere: [] as W[] };
  for (const one of work) {
    if (finishedHere.has(one.id) || isFinished(one.state)) {
      day.finishedHere.push(one);
    } else if (isNow(one, now)) {
      day.now.push(one);
    } else {
      day.later.push(one);
    }
  }
  return day;
};

/** What was done today: this phone's finished work still on its way to the farm first, then the farm's own list, each
 *  piece once. */
export const doneToday = <D extends { id: string }>(
  told: readonly D[],
  finishedHere: readonly D[]
): D[] => {
  const seen = new Set(finishedHere.map((one) => one.id));
  return [...finishedHere, ...told.filter((one) => !seen.has(one.id))];
};

/** What the farm said was done on a day: the latest of it, how much in all, and which farm day it answered for. */
export interface DoneAnswer<D> {
  day: string;
  count: number;
  done: readonly D[];
}

/**
 * The farm's answer about what was done, as far as it is today's: an answer kept on the phone from another day — or
 * from before the farm said which day it was answering for — is nothing done, so yesterday's work never reads as done
 * today and never makes a day "all done". Within today's answer each piece is held to the farm's day by when it was
 * finished, as the farm itself holds it, and the count gives up whatever that drops.
 */
export const doneOnTheDay = <D extends { completedAt: Date | string | null }>(
  answer: DoneAnswer<D> | undefined,
  now: Date
): { done: D[]; count: number } => {
  const today = farmDayOf(now);
  if (!answer || Array.isArray(answer) || answer.day !== today) {
    return { done: [], count: 0 };
  }
  const done = answer.done.filter(
    (one) =>
      one.completedAt !== null && farmDayOf(new Date(one.completedAt)) === today
  );
  return {
    done,
    count: Math.max(0, answer.count - (answer.done.length - done.length)),
  };
};

/** Earlier due first. */
const soonest = (a: ListedWork, b: ListedWork) =>
  new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();

/** Whether the person holding the phone may start this work: nobody else pinned it, nobody else holds it. The one rule
 *  for "free" — the list's Start button, the next job offered, and the count on the bar all read it. */
export const freeFor = (
  one: Pick<ListedWork, "assignedTo" | "claimedBy">,
  me: string | undefined
): boolean =>
  (one.assignedTo === null || one.assignedTo === me) &&
  (one.claimedBy === null || one.claimedBy === me);

/**
 * The work to offer once a piece is finished: the next free work in the same Pen, what is wanted now before what is
 * wanted later, the soonest first — the feeding after the milking, where the milker already is. Nothing when the Pen's
 * day is done, or the work was in no Pen.
 */
export const nextInPen = <W extends ListedWork>(
  work: readonly W[],
  {
    finishedId,
    penId,
    me,
    now,
    finishedHere,
  }: {
    finishedId: string;
    penId: string | null;
    me: string | undefined;
    now: Date;
    finishedHere: ReadonlySet<string>;
  }
): W | null => {
  if (penId === null) {
    return null;
  }
  const left = work.filter(
    (one) => one.id !== finishedId && one.penId === penId && freeFor(one, me)
  );
  const day = groupTheDay(left, { now, finishedHere });
  return day.now.toSorted(soonest)[0] ?? day.later.toSorted(soonest)[0] ?? null;
};

/** How much is owed now that this person may start — late, under way, or due within the hour, and nobody else's: the
 *  count Today's work carries on the phone's bar. */
export const owedNowBy = (
  work: readonly ListedWork[],
  {
    me,
    now,
    finishedHere,
  }: { me: string | undefined; now: Date; finishedHere: ReadonlySet<string> }
): number =>
  groupTheDay(work, { now, finishedHere }).now.filter((one) => freeFor(one, me))
    .length;
