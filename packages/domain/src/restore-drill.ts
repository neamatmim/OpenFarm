import { addMonths } from "./campaign-interval";

/** A **Restore Drill** comes round once a quarter (docs/runbooks/restore-drill.md). */
export const DRILL_EVERY_MONTHS = 3;

/**
 * When the farm's next Restore Drill falls due, and whether that day has gone by: a quarter after the last one, written
 * down whether or not it went well — a drill that found something missing was still done, and the next one is what
 * checks it was mended. A farm that has never drilled is counted from its first good copy, the first thing there was to
 * restore; one with no good copy at all is asked nothing here, since its backups are the louder problem. Overdue the day
 * after it falls due. Farm days, `YYYY-MM-DD`.
 */
export const drillStanding = ({
  lastDrillOn,
  firstGoodCopyOn,
  today,
}: {
  lastDrillOn: string | null;
  firstGoodCopyOn: string | null;
  today: string;
}): { dueOn: string | null; overdue: boolean } => {
  const countedFrom = lastDrillOn ?? firstGoodCopyOn;
  if (countedFrom === null) {
    return { dueOn: null, overdue: false };
  }
  const dueOn = addMonths(countedFrom, DRILL_EVERY_MONTHS);
  return { dueOn, overdue: today > dueOn };
};
