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
import { stepCompletion } from "./instance";

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

/** How a weight was arrived at. A crush scale today; a girth tape, if the farm ever falls back
 *  to one, is recorded as an estimate so nobody reads it as a measurement. */
export const WEIGH_METHODS = ["scale"] as const;

/**
 * A recorded scale reading for one Animal on a date.
 *
 * Kept for ever and never overwritten: the whole of fattening is the difference between two of
 * these, and a farm that keeps only the latest has thrown away everything it was measuring.
 * Keyed on the Step Completion, so a phone replaying its outbox or a Manager correcting an entry
 * replaces the reading rather than adding a second one (ADR 0002).
 */
export const weighIn = pgTable(
  "weigh_in",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    weightKg: numeric("weight_kg", { precision: 7, scale: 2 }).notNull(),
    method: text("method", { enum: WEIGH_METHODS }).notNull().default("scale"),
    /** What the farm found doubtful about this reading, in its own words, and null for one it
     *  did not doubt. The reading is kept either way: the barn wrote it down (ADR 0002). */
    flaggedNote: text("flagged_note"),
    weighedAt: timestamp("weighed_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("weigh_in_completion_uidx").on(table.completionId),
    index("weigh_in_animal_idx").on(table.animalId, table.weighedAt),
  ]
);

/** Why the farm suggested an Animal. Its own copy, as `SIDES` and `ANIMAL_STATES` are: this
 *  package depends on nothing, and the domain keeps the rule that reads it. */
export const READY_REASONS = ["weight", "window"] as const;

/**
 * The Manager has looked at an Animal the farm suggested and decided she is staying.
 *
 * Kept so the farm stops shouting about her: a suggestion that returns every morning after it has
 * been answered is a suggestion nobody reads. One row per Animal — a second look replaces the
 * first, because what matters is the last thing the Manager decided about her.
 */
export const readySetAside = pgTable(
  "ready_set_aside",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** Which suggestion was answered. A weight set aside is still overruled by the window
     *  opening; a window set aside is the last word, there being no stronger ground. */
    because: text("because", { enum: READY_REASONS }).notNull(),
    /** Why she is staying, in the Manager's own words. A queue cleared without a word is a
     *  queue nobody can audit. */
    reason: text("reason").notNull(),
    setAsideBy: text("set_aside_by").references(() => user.id),
    setAsideAt: timestamp("set_aside_at").notNull(),
  },
  (table) => [uniqueIndex("ready_set_aside_animal_uidx").on(table.animalId)]
);
