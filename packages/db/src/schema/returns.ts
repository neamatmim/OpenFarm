import { index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";

/**
 * A **Bank Rate**: a rate a year the Owner types, with a note of what it is, as the bank quotes it before its tax, to
 * set beside what the Farm's money made in cattle.
 *
 * Kept from its day until the next, never edited: a rate put right is a new row from the same day, and the old one
 * stays in the list. A Season or a Venture reads the one in force on the day its first taka went in — the latest
 * `from_day` on or before it, then the latest `recorded_at`, then the latest `id` — as a deposit would have locked it.
 * The Owner's alone, and never shown to an Investor.
 */
export const bankRate = pgTable(
  "bank_rate",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Taka a year on every hundred, 0 to 100, to two places as a bank's notice prints it. */
    perYear: numeric("per_year", { precision: 5, scale: 2 }).notNull(),
    /** What it is: the bank, the account, and whether provisional or final. */
    note: text("note").notNull(),
    /** The farm's day it holds from. */
    fromDay: text("from_day").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [index("bank_rate_farm_idx").on(table.farmId, table.fromDay)]
);
