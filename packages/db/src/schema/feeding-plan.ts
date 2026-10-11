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
import { animal } from "./herd";

/** Approved planning revisions are immutable. Snapshots include ration contents and adjusted gains; later edits do
 * not rewrite the purchase-day baseline. They never assign a ration to a pen or record feed as given. */
export const animalFeedPlan = pgTable(
  "animal_feed_plan",
  {
    id: text("id").primaryKey(),
    revision: integer("revision").notNull(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id),
    supersedesId: text("supersedes_id"),
    snapshot: jsonb("snapshot").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("animal_feed_plan_revision_uidx").on(
      table.animalId,
      table.revision
    ),
    index("animal_feed_plan_animal_idx").on(
      table.farmId,
      table.animalId,
      table.createdAt
    ),
  ]
);
