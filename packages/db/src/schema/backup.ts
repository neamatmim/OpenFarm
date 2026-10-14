import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";

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
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Null while it is still running, or if the job died without saying so. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** How big the encrypted copy came out. A copy that suddenly shrinks is worth seeing. */
    sizeBytes: text("size_bytes"),
    /** Where it went, in words — the bucket or host, never a credential. */
    destination: text("destination").notNull(),
    ok: text("ok", { enum: ["yes", "no"] }).notNull(),
    /** What went wrong, when something did. */
    detail: text("detail"),
    /** How many rows each of the farm's key tables held as the copy began, written by the job before it takes
     *  the dump — so the copy carries, in its own row, what a restore of it must give back. Null on a copy
     *  taken before this was counted. */
    held: jsonb("held").$type<Record<string, number>>(),
  },
  (table) => [index("backup_run_idx").on(table.startedAt)]
);

/**
 * A **Restore Drill**: the quarterly rehearsal of losing the farm's database — a backup restored into a scratch
 * environment and checked by the Manager in the app (docs/runbooks/restore-drill.md) — written down in the farm it
 * rehearsed, whether or not it went well. Never edited: one written down wrong is written down again, and the latest
 * stands.
 */
export const restoreDrill = pgTable(
  "restore_drill",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** The farm day it was done, its start. */
    doneOn: timestamp("done_on", { withTimezone: true }).notNull(),
    wentWell: boolean("went_well").notNull(),
    /** Which copy was restored, as the runbook asks: its day, or its file's name. */
    backupUsed: text("backup_used"),
    /** What was checked, and — required when it did not go well — what was missing. */
    note: text("note"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("restore_drill_farm_idx").on(table.farmId, table.doneOn)]
);
