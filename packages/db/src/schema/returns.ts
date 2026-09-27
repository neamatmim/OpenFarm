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

/**
 * What a dairy Animal was taken on at, for her **Return on Cost**: a cow bought, or one here before the farm kept its
 * books, has a price the Owner enters, with a note of where it came from, and her stay counts from its day. One bred
 * here needs none — she is counted from her birth, at nothing. One per Animal, put right by the Owner writing it again.
 */
export const dairyEntryPrice = pgTable(
  "dairy_entry_price",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    priceBdt: integer("price_bdt").notNull(),
    /** The farm's day her stay counts from: the day she was registered, unless the Owner says. */
    asOf: text("as_of").notNull(),
    note: text("note").notNull(),
    setBy: text("set_by").references(() => user.id),
    setAt: timestamp("set_at").notNull(),
  },
  (table) => [uniqueIndex("dairy_entry_price_animal_uidx").on(table.animalId)]
);

/** The kinds of dairy Animal a **Head Price** is set for: each a dairy State, since a cow is sold by what she is. */
export const HEAD_PRICE_KINDS = [
  "calf",
  "heifer",
  "pregnant_heifer",
  "milking",
  "dry",
] as const;
export type HeadPriceKind = (typeof HEAD_PRICE_KINDS)[number];

/**
 * A **Head Price**: the low and the high price a head the Owner sets for one kind of dairy Animal, which one still here
 * counts at in her Return on Cost. One per farm per kind, written again to put it right.
 */
export const headPrice = pgTable(
  "head_price",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: HEAD_PRICE_KINDS }).notNull(),
    lowBdt: integer("low_bdt").notNull(),
    highBdt: integer("high_bdt").notNull(),
    setBy: text("set_by").references(() => user.id),
    setAt: timestamp("set_at").notNull(),
  },
  (table) => [uniqueIndex("head_price_kind_uidx").on(table.farmId, table.kind)]
);
