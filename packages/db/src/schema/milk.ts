import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { counterparty } from "./fattening";
import { animal, pen } from "./herd";
import { sopInstance, stepCompletion } from "./instance";
import { MILK_DESTINATIONS } from "./milk-destinations";

/** One Milking Session for one Pen — the milking SOP Instance, seen from the dairy's side.
 *  Holds the bulk total and how far it sits from the sum of the per-cow records. */
export const milkingSession = pgTable(
  "milking_session",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    instanceId: text("instance_id")
      .notNull()
      .references(() => sopInstance.id, { onDelete: "cascade" }),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    dueAt: timestamp("due_at").notNull(),
    /** What the tank read; null until the closing Step is done. */
    bulkLitres: numeric("bulk_litres", { precision: 10, scale: 2 }),
    /** The sum of the per-cow records destined for Bulk, at the moment the total was taken. */
    sumBulkLitres: numeric("sum_bulk_litres", { precision: 10, scale: 2 }),
    /** bulk − sum. Positive means the tank held more than the cows account for. */
    differenceLitres: numeric("difference_litres", { precision: 10, scale: 2 }),
    /** The farm's tolerance as it stood when the total was taken, so the flag stays
     *  explicable after the parameter is changed. */
    tolerancePercent: integer("tolerance_percent"),
    /** Set when the difference is beyond that tolerance — the Manager looks at it. */
    flaggedAt: timestamp("flagged_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("milking_session_instance_uidx").on(table.instanceId),
    index("milking_session_pen_idx").on(table.farmId, table.penId, table.dueAt),
  ]
);

/** The litres one cow gave in one Milking Session, and where they went. */
export const milkRecord = pgTable(
  "milk_record",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => milkingSession.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** The Step Completion this came from. Unique, so replaying it cannot double-count. */
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    litres: numeric("litres", { precision: 6, scale: 2 }).notNull(),
    destination: text("destination", { enum: MILK_DESTINATIONS }).notNull(),
    /** The Destination was taken out of the person's hands by a Withdrawal, rather than
     *  chosen — so milk poured away under a gate reads apart from milk poured away by
     *  judgement. */
    forced: boolean("forced").notNull().default(false),
    /** The lactation this milking belongs to, as it stood when recorded. */
    lactationNumber: integer("lactation_number"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("milk_record_completion_uidx").on(table.completionId),
    index("milk_record_animal_idx").on(
      table.farmId,
      table.animalId,
      table.recordedAt
    ),
    index("milk_record_session_idx").on(table.sessionId),
  ]
);

/**
 * Bulk milk handed over to a buyer: when, how many litres, to whom, the challan the buyer's collector
 * wrote, the price, and the fat and SNF if the processor measured them.
 *
 * The farm's milk-buyer record under the Safe Food Act (s.38) — the buyer's name and address come from
 * the Counterparty — and what the milk sale's money is worked out from. The Manager's to record.
 */
export const dispatch = pgTable(
  "dispatch",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    dispatchedAt: timestamp("dispatched_at").notNull(),
    litres: numeric("litres", { precision: 10, scale: 2 }).notNull(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => counterparty.id),
    /** The collector's slip number, when the buyer gives one. A buyer at the gate may not. */
    challan: text("challan"),
    pricePerLitreBdt: numeric("price_per_litre_bdt", {
      precision: 8,
      scale: 2,
    }).notNull(),
    fatPercent: numeric("fat_percent", { precision: 4, scale: 2 }),
    snfPercent: numeric("snf_percent", { precision: 4, scale: 2 }),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [index("dispatch_farm_idx").on(table.farmId, table.dispatchedAt)]
);
