import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** What a copy was taken for. Nightlies age out; monthlies are kept for as long as the farm
 *  keeps anything, which is for ever (Audit trail and correction rules). */
export const BACKUP_KINDS = ["nightly", "monthly", "manual"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/**
 * One attempt at taking a copy of the farm off the machine it lives on.
 *
 * Written by the job itself, and read by the Manager, so "are the backups running?" is a
 * question the app answers rather than one somebody has to go and find a console for. A row
 * that says a copy failed is worth more than no row at all: silence is what nobody notices.
 *
 * Not Farm-scoped: a copy is of the whole database, and the database is the farm.
 */
export const backupRun = pgTable(
  "backup_run",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: BACKUP_KINDS }).notNull(),
    startedAt: timestamp("started_at").notNull(),
    /** Null while it is still running, or if the job died without saying so. */
    finishedAt: timestamp("finished_at"),
    /** How big the encrypted copy came out. A copy that suddenly shrinks is worth seeing. */
    sizeBytes: text("size_bytes"),
    /** Where it went, in words — the bucket or host, never a credential. */
    destination: text("destination").notNull(),
    ok: text("ok", { enum: ["yes", "no"] }).notNull(),
    /** What went wrong, when something did. */
    detail: text("detail"),
  },
  (table) => [index("backup_run_idx").on(table.startedAt)]
);
