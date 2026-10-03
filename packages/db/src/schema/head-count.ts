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
import { pen } from "./herd";
import { sopInstance, stepCompletion } from "./instance";

/**
 * One Pen's evening **Head Count**: how many animals the person counting found standing in it, blind, beside how many
 * the register put there at the moment it was counted — and which, so the Manager walking the Pen knows whom to look
 * for. Written by the Step that counted, keyed on its Completion, so a recount put right rewrites it and compares again.
 */
export const headCount = pgTable(
  "head_count",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    /** The evening's work for the Pen: what the Manager is told of, and opens to count again. */
    instanceId: text("instance_id")
      .notNull()
      .references(() => sopInstance.id),
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id),
    counted: integer("counted").notNull(),
    expected: integer("expected").notNull(),
    /** The animals the register put in the Pen when it was counted. */
    expectedIds: jsonb("expected_ids").$type<string[]>().notNull(),
    countedAt: timestamp("counted_at").notNull(),
    countedBy: text("counted_by")
      .notNull()
      .references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("head_count_completion_uidx").on(table.completionId),
    index("head_count_farm_idx").on(table.farmId, table.countedAt),
  ]
);
