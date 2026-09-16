import { createHash } from "node:crypto";

import type { Database } from "@OpenFarm/db";
import { and, desc, eq } from "@OpenFarm/db/operators";
import type { EntryOutcome, SyncKind } from "@OpenFarm/db/schema/sync";
import { syncBatch, syncEntry } from "@OpenFarm/db/schema/sync";

import type { Tx } from "./audit";
import type { EntryRefusal } from "./entries/entry";

const MINUTE_MS = 60_000;

/** Where a sequence belongs: the Shed Phone that holds the outbox, or the person, when they
 *  are on their own phone. Never empty, so the unique index has something to bite on. */
export const sourceKeyFor = (context: {
  device: { id: string } | null;
  actor: { id: string };
}): string => context.device?.id ?? context.actor.id;

/** A digest of what was sent, so the same key carrying different work is refused rather than
 *  answered with someone else's result. A digest rather than the payload: the point is to
 *  tell two batches apart, not to keep a second copy of one. */
export const fingerprint = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

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
 * Sequence numbers this source has made and the farm has never read — before the batch, and
 * within it. Entries still in an outbox somewhere, or gone with the phone. Worth telling
 * someone; never worth refusing what did arrive.
 */
export const missingSeqs = (
  highest: number | null,
  arriving: readonly number[]
): number[] => {
  if (arriving.length === 0) {
    return [];
  }
  const here = new Set(arriving);
  const from = (highest ?? Math.min(...arriving) - 1) + 1;
  const to = Math.max(...arriving);
  const missing: number[] = [];
  for (let seq = from; seq < to; seq += 1) {
    if (!here.has(seq)) {
      missing.push(seq);
    }
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

/** Has this exact entry been read before, and what was it told? */
export const entrySeen = (tx: Tx, farmId: string, id: string) =>
  tx.query.syncEntry.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      seq: true,
      outcome: true,
      reason: true,
      refusal: true,
    },
  });

/** Has this source already used that sequence number for something else? */
export const seqTaken = (tx: Tx, sourceKey: string, seq: number) =>
  tx.query.syncEntry.findFirst({
    where: { sourceKey, seq },
    columns: { id: true },
  });

/**
 * Records that this entry was read, under the sequence number the phone gave it, with what
 * the phone sent when the farm could not take it into its records as it stands. Nothing a
 * person wrote down is lost (ADR 0002).
 */
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
    payload: unknown;
    reason: string | null;
    /** How the farm sorted one it could not take, for whenever it is asked about again. Null for one it took. */
    refusal: EntryRefusal | null;
    recordedAt: Date;
    receivedAt: Date;
  }
): Promise<void> => {
  await tx.insert(syncEntry).values(entry).onConflictDoNothing();
};

/** The batch under this key, whoever sent it. Keys are the client's own, so one belonging to
 *  another Farm is a collision worth saying out loud rather than answering. */
export const batchUnder = (db: Pick<Database, "query"> | Tx, key: string) =>
  db.query.syncBatch.findFirst({ where: { key } });

/** Takes the key for this batch, or says it was already taken. Reserved before anything is
 *  applied, so two phones replaying the same batch at once meet here rather than both
 *  applying it. */
export const reserveBatch = async (
  tx: Tx,
  batch: {
    key: string;
    farmId: string;
    actorId: string;
    requestHash: string;
    receivedAt: Date;
  }
): Promise<boolean> => {
  const [reserved] = await tx
    .insert(syncBatch)
    .values(batch)
    .onConflictDoNothing()
    .returning({ key: syncBatch.key });
  return Boolean(reserved);
};

/** Stores what the batch was told, so a replay is answered rather than applied again. */
export const recordBatchResponse = async (
  tx: Tx,
  key: string,
  farmId: string,
  response: unknown
): Promise<void> => {
  await tx
    .update(syncBatch)
    .set({ response })
    .where(and(eq(syncBatch.key, key), eq(syncBatch.farmId, farmId)));
};
