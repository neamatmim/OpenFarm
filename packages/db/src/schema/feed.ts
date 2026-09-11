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
import { ROLES, farm } from "./farm";
import { pen } from "./herd";

/** Something the Farm feeds, in kilos. Home-grown fodder is a Feed Item too. Retired rather
 *  than removed: a Ration the farm fed in March still names it. */
export const feedItem = pgTable(
  "feed_item",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    /** What it is measured in. Kilos unless the farm says otherwise — straw comes in bales
     *  and molasses in litres, and a Ration line means whatever this says. */
    unit: text("unit").notNull().default("kg"),
    retiredAt: timestamp("retired_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("feed_item_name_uidx").on(table.farmId, table.nameBn)]
);

/**
 * A named list of what animals are fed in a day, assigned to whichever Pens are on it — the
 * three milking pens are usually on one Ration, and changing it should be one change, not
 * three that can quietly drift apart.
 *
 * What it *says* lives in immutable Versions, like an SOP (ADR 0001): changing a Ration
 * publishes the next one, so what a Pen was fed in March can still be shown in June.
 */
export const ration = pgTable(
  "ration",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    currentVersionId: text("current_version_id"),
    retiredAt: timestamp("retired_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("ration_name_uidx").on(table.farmId, table.nameBn)]
);

/** Which Ration a Pen is on. One at a time; changing it is a fact the trail records. */
export const penRation = pgTable("pen_ration", {
  penId: text("pen_id")
    .primaryKey()
    .references(() => pen.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  rationId: text("ration_id")
    .notNull()
    .references(() => ration.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").references(() => user.id),
  assignedAt: timestamp("assigned_at").notNull(),
});

/** One published statement of a Ration. Never updated: the next change is the next Version. */
export const rationVersion = pgTable(
  "ration_version",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    rationId: text("ration_id")
      .notNull()
      .references(() => ration.id, { onDelete: "cascade" }),
    /** 1, 2, 3 … within the Ration. */
    number: integer("number").notNull(),
    /** How often this Pen is fed, so one session's share can be worked out from a day's. */
    sessionsPerDay: integer("sessions_per_day").notNull(),
    /** [{ feedItemId, kgPerAnimalPerDay }] — what one animal gets in a day. */
    items: jsonb("items").notNull(),
    note: text("note"),
    publishedBy: text("published_by").references(() => user.id),
    publishedByRole: text("published_by_role", { enum: ROLES }),
    publishedAt: timestamp("published_at").notNull(),
  },
  (table) => [
    uniqueIndex("ration_version_number_uidx").on(table.rationId, table.number),
    /** The Version in force at a given moment, which is what in-flight work reads. */
    index("ration_version_at_idx").on(table.rationId, table.publishedAt),
  ]
);
