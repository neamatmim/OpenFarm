import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The latest durable state of each server-owned schedule.
 *
 * This is a singleton today because one database is one farm, but the named key
 * keeps the record extensible if another independent schedule is introduced.
 */
export const schedulerState = pgTable("scheduler_state", {
  id: text("id").primaryKey(),
  lastRanAt: timestamp("last_ran_at").notNull(),
  lastOkAt: timestamp("last_ok_at"),
  lastError: text("last_error"),
});
