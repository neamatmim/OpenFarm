import type { Step } from "./sop";
import { nothingToNoteOf } from "./sop";

/**
 * What a piece of work came to, for the person who checks it: in a line on a phone, rather than by opening each of forty a
 * day. And whether it is clean — done on time, nothing the farm flagged, nothing skipped but animals passed as well — the
 * work a checker may approve together, leaving the rest to be read.
 */

const MINUTE_MS = 60_000;

/** One piece of work waiting for its check, as it stands. */
export interface WorkToCheck {
  dueAt: Date;
  graceMinutes: number;
  completedAt: Date | null;
  steps: readonly Pick<Step, "id" | "skipReasons">[];
  completions: readonly {
    stepId: string;
    status: string;
    skipReason: string | null;
    outOfRange: string | null;
  }[];
  /** The Milking Session it wrote, for work that milks. */
  milk: {
    bulkLiters: number | null;
    differenceLiters: number | null;
    flagged: boolean;
  } | null;
  /** The feeding it wrote, for work that feeds. */
  fed: { shortfallPercent: number; flagged: boolean } | null;
}

export interface CheckSummary {
  done: number;
  /** Animals passed as well, with nothing to note: looked at, not skipped. */
  passedWell: number;
  skipped: number;
  /** Figures typed outside what the Step expects, kept anyway. */
  outOfRange: number;
  /** Finished after its due time and its grace. */
  late: boolean;
  milk: { bulkLiters: number | null; differenceLiters: number | null } | null;
  /** How far short a feeding came, where it did. */
  shortFedPercent: number | null;
  /** Something the farm itself flagged: the tank against the cows, a short feed, a figure out of range. */
  flagged: boolean;
  /** On time, nothing flagged, nothing skipped but animals passed as well. */
  clean: boolean;
}

/** What one piece of work came to. */
export const checkSummaryOf = (work: WorkToCheck): CheckSummary => {
  const wellBy = new Map(
    work.steps.map((step) => [step.id, nothingToNoteOf(step)?.bn])
  );
  let done = 0;
  let passedWell = 0;
  let skipped = 0;
  let outOfRange = 0;
  for (const completion of work.completions) {
    if (completion.outOfRange) {
      outOfRange += 1;
    }
    if (completion.status !== "skipped") {
      done += 1;
    } else if (
      completion.skipReason !== null &&
      completion.skipReason === wellBy.get(completion.stepId)
    ) {
      passedWell += 1;
    } else {
      skipped += 1;
    }
  }
  const late =
    work.completedAt !== null &&
    work.completedAt.getTime() >
      work.dueAt.getTime() + work.graceMinutes * MINUTE_MS;
  const flagged =
    Boolean(work.milk?.flagged) || Boolean(work.fed?.flagged) || outOfRange > 0;
  return {
    done,
    passedWell,
    skipped,
    outOfRange,
    late,
    milk: work.milk
      ? {
          bulkLiters: work.milk.bulkLiters,
          differenceLiters: work.milk.differenceLiters,
        }
      : null,
    shortFedPercent:
      work.fed && work.fed.shortfallPercent > 0
        ? work.fed.shortfallPercent
        : null,
    flagged,
    clean: !late && !flagged && skipped === 0,
  };
};
