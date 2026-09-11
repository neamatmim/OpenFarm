import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { animal } from "./herd";
import { stepCompletion } from "./instance";

/**
 * What somebody saw of one animal on the round: off her feed, limping, bulling. The farm's
 * **Observation** — a note that starts the health chain — written by the Step that recorded
 * it rather than typed somewhere afterwards. Health (increment 3) turns one into a Diagnosis
 * and Breeding (increment 5) reads the ones that say oestrus as Heats, so what is recorded
 * today has to still mean the same thing then.
 *
 * A Correction never rewrites one. It withdraws it and writes the new one beside it: what
 * somebody said they saw is a fact about the round, and it stays true that they said it even
 * after the farm decides they were looking at the wrong cow.
 */
export const observation = pgTable(
  "observation",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** The Step that recorded it. */
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    /** What was seen, as the Version's own choice value — the stable word Health and
     *  Breeding will match on. */
    saw: text("saw").notNull(),
    /** The Bangla the person actually chose, kept with the record: the Version may be
     *  reworded next season, and what this round said should not change with it. */
    sawLabel: text("saw_label").notNull(),
    seenBy: text("seen_by").references(() => user.id),
    seenAt: timestamp("seen_at").notNull(),
    /** When a Correction withdrew it, and what stands in its place. Nothing is deleted. */
    withdrawnAt: timestamp("withdrawn_at"),
    supersededById: text("superseded_by_id"),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    index("observation_animal_idx").on(table.animalId, table.seenAt),
    /** The farm-wide sweep: everything seen this week, whatever animal it was seen on. */
    index("observation_farm_idx").on(table.farmId, table.seenAt),
    /** One Observation standing per Completion: a Correction withdraws the old one first. */
    uniqueIndex("observation_completion_uidx")
      .on(table.completionId)
      .where(sql`${table.withdrawnAt} is null`),
  ]
);
