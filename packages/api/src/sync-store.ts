import { uuidv7 } from "@OpenFarm/db/ids";
import { desc, eq, sql } from "@OpenFarm/db/operators";
import type { ReviewReason } from "@OpenFarm/db/schema/review";
import type { EntryOutcome, SyncKind } from "@OpenFarm/db/schema/sync";
import { syncEntry } from "@OpenFarm/db/schema/sync";

import type { Tx } from "./audit";

const MINUTE_MS = 60_000;

/** Where a sequence belongs: the Shed Phone that holds the outbox, or the person, when they
 *  are on their own phone. Never empty, so the unique index has something to bite on. */
export const sourceKeyFor = (context: {
  device: { id: string } | null;
  actor: { id: string };
}): string => context.device?.id ?? context.actor.id;

/** A stable fingerprint of what was sent, so the same key carrying different work is refused
 *  rather than answered with someone else's result. */
export const fingerprint = (payload: unknown): string =>
  JSON.stringify(payload);

/** The highest sequence number this source has ever had read. */
export const highestSeq = async (
  tx: Tx,
  sourceKey: string
): Promise<number | null> => {
  const [row] = await tx
    .select({ seq: syncEntry.seq })
    .from(syncEntry)
    .where(eq(syncEntry.sourceKey, sourceKey))
    .orderBy(desc(syncEntry.seq))
    .limit(1);
  return row?.seq ?? null;
};

/**
 * The sequence numbers between what the farm has read and what has just arrived. Entries the
 * phone made and the farm has never seen: still in an outbox somewhere, or lost with the
 * phone. Worth telling someone; never worth refusing what did arrive.
 */
export const gapsBefore = (
  highest: number | null,
  arriving: readonly number[]
): number[] => {
  const lowest = Math.min(...arriving);
  if (highest === null || lowest <= highest + 1) {
    return [];
  }
  const missing: number[] = [];
  for (let seq = highest + 1; seq < lowest; seq += 1) {
    missing.push(seq);
  }
  return missing;
};

/** Is this phone's clock far enough out that its times cannot be taken at face value? */
export const clockIsOut = (
  recordedAt: Date,
  receivedAt: Date,
  skewMinutes: number
): boolean =>
  Math.abs(recordedAt.getTime() - receivedAt.getTime()) >
  skewMinutes * MINUTE_MS;

/** Records that this entry was read, under the sequence number the phone gave it. The unique
 *  index on (source, seq) is what makes a replay a no-op and a reused number visible. */
export const rememberEntry = async (
  tx: Tx,
  entry: {
    id: string;
    farmId: string;
    sourceKey: string;
    seq: number;
    kind: SyncKind;
    outcome: EntryOutcome;
    batchKey: string;
    recordedAt: Date;
    receivedAt: Date;
  }
): Promise<void> => {
  await tx.insert(syncEntry).values(entry).onConflictDoNothing();
};

/** Has this exact entry been read before, and under which sequence number? */
export const entrySeen = (tx: Tx, id: string) =>
  tx.query.syncEntry.findFirst({
    where: { id },
    columns: { id: true, seq: true, outcome: true, sourceKey: true },
  });

/** The reasons a batch can flag rather than refuse. Kept here so the router reads as a list
 *  of judgements rather than a list of strings. */
export const FLAG_REASONS = {
  late: "late_entry" as ReviewReason,
  gap: "sync_gap" as ReviewReason,
  skew: "clock_skew" as ReviewReason,
};

export const newEntryId = (now: Date): string => uuidv7(now);

/** Postgres's own count, for a test that wants to know nothing was written. */
export const countEntries = async (
  tx: Tx,
  sourceKey: string
): Promise<number> => {
  const [row] = await tx
    .select({ total: sql<string>`count(*)` })
    .from(syncEntry)
    .where(eq(syncEntry.sourceKey, sourceKey));
  return Number(row?.total ?? 0);
};
