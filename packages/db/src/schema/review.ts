import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { auditEvent } from "./audit";
import { user } from "./auth";
import { farm } from "./farm";

/** Why something was put in front of the Manager. The list grows as increments add effects
 *  that cannot be walked back; the first one is a Correction to work already signed off. */
export const REVIEW_REASONS = [
  "corrected_after_sign_off",
  "irreversible_effect",
  "late_entry",
  "sync_gap",
  "clock_skew",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

/**
 * Something the system could not put right on its own, waiting for a person to look at it.
 * Raised by a Correction whose effects it cannot safely undo — a calf already created, a
 * sale already made, or, in Release 1, figures a checker has already signed off. Never
 * raised by a person, and never resolved by the system: closing one is a judgement, and it
 * is recorded as one.
 */
export const needsReview = pgTable(
  "needs_review",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** What wants looking at — the entity and id the Audit Event uses. */
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    reason: text("reason", { enum: REVIEW_REASONS }).notNull(),
    /** The Correction that raised it, so the trail reads from either end. The constraint is
     *  DEFERRABLE INITIALLY DEFERRED in the migration: a Correction raises its Needs Review
     *  inside its own transaction, and its Audit Event is written last. */
    auditEventId: text("audit_event_id")
      .notNull()
      .references(() => auditEvent.id),
    raisedAt: timestamp("raised_at").notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by").references(() => user.id),
    /** What the person decided. Required to resolve: a queue cleared without a word is a
     *  queue nobody can audit. */
    resolution: text("resolution"),
  },
  (table) => [
    index("needs_review_open_idx").on(
      table.farmId,
      table.resolvedAt,
      table.raisedAt
    ),
    index("needs_review_entity_idx").on(table.entity, table.entityId),
  ]
);
