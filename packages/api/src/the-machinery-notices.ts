import type { Database } from "@OpenFarm/db";

import type { Tx } from "./audit";
import type { Raised } from "./notice";
import { tell } from "./notice";

/**
 * Telling the Owner that the farm's own machinery has gone quiet: the Day Turning no longer turning whole, or no
 * copy of the farm succeeding. Nobody on the farm would notice either — no work raised looks like a quiet morning,
 * and no copy taken looks like nothing at all — and the Owner is the one who holds the credentials to put them right.
 *
 * Asked by the server's own timer and nowhere else. It is the server watching itself; somebody opening the app is
 * not a reason to look, and a farm whose timer has stopped is one whose Owner hears about it the moment it starts
 * again or from the systems page, never from this.
 */

/** A copy is taken nightly, so a day and a half without a good one is a night missed and the next one not in yet. */
const COPY_GRACE_MS = 36 * 60 * 60 * 1000;

/** Long enough that one turn failing on a database that blinked is not worth a buzz; short enough that a morning's
 *  work is not lost to it. */
const TURNING_GRACE_MS = 30 * 60 * 1000;

/** One thing to tell, filed under an id that names this stretch of it, so it is told once however often it is found. */
export interface Quiet {
  kind: "backup_overdue" | "day_not_turning";
  id: string;
  since: Date;
}

/**
 * Whether the farm has gone too long without a good copy.
 *
 * Nothing for a farm that has never tried to take one: that is an install whose backups are not set up yet, which
 * the go-live checklist asks about, and not a job that has stopped. A farm whose copies have tried and never once
 * worked is counted from its first try.
 */
export const backupGap = async (
  db: Pick<Database, "query"> | Tx,
  now: Date
): Promise<Quiet | null> => {
  const lastGood = await db.query.backupRun.findFirst({
    where: { ok: "yes" },
    orderBy: { startedAt: "desc", id: "desc" },
    columns: { id: true, startedAt: true },
  });
  const counted =
    lastGood ??
    (await db.query.backupRun.findFirst({
      orderBy: { startedAt: "asc", id: "asc" },
      columns: { id: true, startedAt: true },
    }));
  if (!counted || now.getTime() - counted.startedAt.getTime() < COPY_GRACE_MS) {
    return null;
  }
  return {
    kind: "backup_overdue",
    id: lastGood ? `backup:${lastGood.id}` : "backup:never",
    since: counted.startedAt,
  };
};

/**
 * Whether the Day Turning has stopped turning whole: this turn went wrong, and the last clean one is half an hour or
 * more behind it. A farm that has never turned whole is told the first time, since there is no clean turn to wait on.
 */
export const dayNotTurning = ({
  failed,
  lastOkAt,
  now,
}: {
  failed: boolean;
  lastOkAt: Date | null;
  now: Date;
}): Quiet | null => {
  if (!failed) {
    return null;
  }
  if (lastOkAt && now.getTime() - lastOkAt.getTime() < TURNING_GRACE_MS) {
    return null;
  }
  return {
    kind: "day_not_turning",
    id: `day:${lastOkAt?.toISOString() ?? "never"}`,
    since: lastOkAt ?? now,
  };
};

/** Which of these the Owner has not been told about yet, asked before any transaction is opened: a timer that finds
 *  the same stopped copies every five minutes must not write an Audit Event saying so every five minutes. */
export const untold = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  found: readonly Quiet[]
): Promise<Quiet[]> => {
  if (found.length === 0) {
    return [];
  }
  const told = await db.query.alert.findMany({
    where: { farmId, entityId: { in: found.map((one) => one.id) } },
    columns: { kind: true, entityId: true },
  });
  return found.filter(
    (one) =>
      !told.some((row) => row.kind === one.kind && row.entityId === one.id)
  );
};

/** Tells the Owner about each, once for each stretch of it. */
export const tellTheOwnerAboutTheMachinery = async (
  tx: Tx,
  farmId: string,
  found: readonly Quiet[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  for (const one of found) {
    // One after another: a transaction has one client, and its reads must not overlap.
    // oxlint-disable-next-line no-await-in-loop
    const told = await tell(
      tx,
      farmId,
      {
        kind: one.kind,
        about: { id: one.id },
        facts: { since: one.since.toISOString() },
      },
      now
    );
    raised.push(...told);
  }
  return raised;
};
