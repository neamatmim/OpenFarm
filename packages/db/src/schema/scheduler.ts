import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The latest durable state of each server-owned schedule.
 *
 * This is a singleton today because one database is one farm, but the named key
 * keeps the record extensible if another independent schedule is introduced.
 */
export const schedulerState = pgTable("scheduler_state", {
  id: text("id").primaryKey(),
  lastRanAt: timestamp("last_ran_at", { withTimezone: true }).notNull(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastError: text("last_error"),
});

/**
 * Where the farm is, as its server was set up to say the first time it started on this database (ADR 0013, 0016): the
 * currency its sums are in, the zone its days are read on, and the month its years first began in. Kept so a server
 * started again with any of them changed is refused rather than reading every sum, day and ended year anew — unless
 * the Owner says plainly that they mean it. One row.
 */
export const serverLocale = pgTable("server_locale", {
  id: text("id").primaryKey(),
  currency: text("currency").notNull(),
  timeZone: text("time_zone").notNull(),
  yearStarts: integer("year_starts").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
});
