import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { stepCompletion } from "./instance";
import { taka } from "./taka";

/**
 * One **Cash Count**: the notes a person found in their own hand, blind, beside what the farm said they held at that
 * moment. The count wins — the hand holds what was counted from then on — so the difference is kept here, as a Stock
 * Count's is, and never quietly absorbed. Written by the Step that counted, keyed on its Completion, so a recount put
 * right rewrites it.
 */
export const cashCount = pgTable(
  "cash_count",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Whose hand was counted: the person counting. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    counted: taka("counted").notNull(),
    /** What the farm said the hand held when it was counted, this count left out. */
    expected: taka("expected").notNull(),
    /** Why it differs, in the counter's words, where they gave one. */
    note: text("note"),
    countedAt: timestamp("counted_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("cash_count_completion_uidx").on(table.completionId),
    index("cash_count_hand_idx").on(table.farmId, table.userId),
  ]
);
