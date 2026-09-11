import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";

/** What a phone's outbox can carry. Observations arrive with health, in a later increment;
 *  the kind exists so a client written against this contract does not have to change. */
export const SYNC_KINDS = [
  "instance_claim",
  "step_completion",
  "completion_photo",
  "instance_complete",
  "animal_move",
  "observation",
] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/**
 * What became of one entry in a batch.
 *
 * - `applied` — it is in the farm's records.
 * - `flagged` — it is in the records, and someone has been asked to look at it anyway: a
 *   phone whose clock is far out still recorded the litres.
 * - `kept` — the world moved past it, so it is not in the records as they stand; what the
 *   phone sent is held whole, with a person asked to decide (ADR 0002: never dropped, and
 *   never overwriting).
 * - `rejected` — it was never valid. The client keeps it so somebody can see what was meant.
 */
export const ENTRY_OUTCOMES = [
  "applied",
  "flagged",
  "kept",
  "rejected",
] as const;
export type EntryOutcome = (typeof ENTRY_OUTCOMES)[number];

/**
 * One batch a phone has sent, and what it was told back. A phone that loses the reply — the
 * signal goes as the request lands — sends the same batch again under the same key, and gets
 * the same answer rather than a second set of records (ADR 0002).
 *
 * Kept for as long as everything else is: a phone can be out of signal for days, and nothing
 * in Release 1 is purged.
 */
export const syncBatch = pgTable(
  "sync_batch",
  {
    /** The client's own key for the transaction, not ours. */
    key: text("key").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    /** A digest of what was sent, so the same key carrying different work is refused rather
     *  than silently answered with someone else's result. */
    requestHash: text("request_hash").notNull(),
    /** The answer, returned verbatim on a replay. */
    response: jsonb("response"),
    receivedAt: timestamp("received_at").notNull(),
  },
  (table) => [index("sync_batch_farm_idx").on(table.farmId, table.receivedAt)]
);

/**
 * One entry a phone has sent, by the sequence number it gave it. The sequence is what makes
 * a gap visible: entry 7 arriving when the farm has only ever seen up to 5 says two entries
 * are somewhere they cannot be read, which is worth telling someone about — and never worth
 * refusing 7 over.
 */
export const syncEntry = pgTable(
  "sync_entry",
  {
    /** The client-generated id of the record itself, so the same entry replayed is the same
     *  row rather than a second one. */
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Where the sequence belongs: a Shed Phone's id, or the person's when they are on their
     *  own phone. Never null, so the unique index below has something to bite on. */
    sourceKey: text("source_key").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: SYNC_KINDS }).notNull(),
    outcome: text("outcome", { enum: ENTRY_OUTCOMES }).notNull(),
    /** What the phone actually sent. Kept for every entry the farm could not take into its
     *  records as it stands — an entry the world moved past, or one that was never valid —
     *  so nothing a person wrote down is lost, and whoever looks at it can see exactly what
     *  was meant (ADR 0002). Null once the entry is in the records on its own account. */
    payload: jsonb("payload"),
    /** Why it could not be taken as it stands. */
    reason: text("reason"),
    /** The batch it came in, so a replay finds its own work. */
    batchKey: text("batch_key")
      .notNull()
      .references(() => syncBatch.key, { onDelete: "cascade" }),
    /** When the phone says it happened, and when the server took it. The phone can never
     *  set the second (ADR 0002). */
    recordedAt: timestamp("recorded_at").notNull(),
    receivedAt: timestamp("received_at").notNull(),
  },
  (table) => [
    uniqueIndex("sync_entry_seq_uidx").on(table.sourceKey, table.seq),
    index("sync_entry_source_idx").on(table.farmId, table.sourceKey, table.seq),
  ]
);
