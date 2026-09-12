import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { animal } from "./herd";

/**
 * A person or business the Farm buys from, sells to, or pays.
 *
 * One table rather than a seller column here and a buyer column there, because it is the same
 * trader either way: the man who sells the farm a bull in Savar is often the man who buys one
 * back at Eid, and a farm that writes his name twice cannot see that.
 */
export const counterparty = pgTable(
  "counterparty",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Where he is, as the farm would say it aloud — a hat, a village, a district. */
    address: text("address"),
    phone: text("phone"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // The same trader, named the same way, is one trader. Recorded once per Farm.
    uniqueIndex("counterparty_name_uidx").on(table.farmId, table.name),
  ]
);

/**
 * The recorded arrival of a bought-in Animal on the Fattening side.
 *
 * One per Animal: an animal arrives once. What it cost and what it weighed on the day are facts
 * about that arrival and never change, which is why they live here rather than on the Animal —
 * the Animal's weight today is a Weigh-in's business.
 */
export const intake = pgTable(
  "intake",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** Who the farm bought it from. Null for an animal whose seller nobody wrote down. */
    counterpartyId: text("counterparty_id").references(() => counterparty.id),
    /** What the farm paid, in taka. One of the two money events in a fattening animal's life. */
    purchasePriceBdt: numeric("purchase_price_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** What it weighed when it came off the lorry: the first point every gain is measured from. */
    weightKg: numeric("weight_kg", { precision: 7, scale: 2 }).notNull(),
    /** Months, as the seller says and the Manager judges. Nobody has a bought-in bull's papers. */
    estimatedAgeMonths: integer("estimated_age_months").notNull(),
    /** The period the farm intends to sell it in — days, as a calendar names them, because Eid
     *  is a date in a calendar and not an instant on a clock. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** What it is being fed towards. Defaulted from the Farm Parameter; per animal, because a
     *  small bull bought cheap is not being fed to the same weight as a big one. */
    targetWeightKg: numeric("target_weight_kg", {
      precision: 7,
      scale: 2,
    }).notNull(),
    arrivedAt: timestamp("arrived_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("intake_animal_uidx").on(table.animalId),
    index("intake_window_idx").on(table.farmId, table.targetWindowStart),
  ]
);
