import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { numericMoney } from "./numeric-columns";

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
      .references(() => sopInstance.id),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    /** What the tank read; null until the closing Step is done. */
    bulkLiters: numeric("bulk_liters", { precision: 10, scale: 2 }),
    /** The sum of the per-cow records destined for Bulk, at the moment the total was taken. */
    sumBulkLiters: numeric("sum_bulk_liters", { precision: 10, scale: 2 }),
    /** bulk − sum. Positive means the tank held more than the cows account for. */
    differenceLiters: numeric("difference_liters", { precision: 10, scale: 2 }),
    /** The farm's tolerance as it stood when the total was taken, so the flag stays
     *  explicable after the parameter is changed. */
    tolerancePercent: integer("tolerance_percent"),
    /** Set when the difference is beyond that tolerance — the Manager looks at it. */
    flaggedAt: timestamp("flagged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("milking_session_instance_uidx").on(table.instanceId),
    index("milking_session_pen_idx").on(table.farmId, table.penId, table.dueAt),
  ]
);

/** The liters one cow gave in one Milking Session, and where they went. */
export const milkRecord = pgTable(
  "milk_record",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => milkingSession.id),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id),
    /** The Step Completion this came from. Unique, so replaying it cannot double-count. */
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id),
    liters: numeric("liters", { precision: 6, scale: 2 }).notNull(),
    destination: text("destination", { enum: MILK_DESTINATIONS }).notNull(),
    /** The Destination was taken out of the person's hands by a Withdrawal, rather than
     *  chosen — so milk poured away under a gate reads apart from milk poured away by
     *  judgment. */
    forced: boolean("forced").notNull().default(false),
    /** She was under a milk Withdrawal when she was milked, as the gate judged it: the milk is withheld milk whether
     *  the phone sent it to Discard itself or the gate had to. What the production report shows apart. */
    underWithdrawal: boolean("under_withdrawal").notNull().default(false),
    /** The lactation this milking belongs to, as it stood when recorded. */
    lactationNumber: integer("lactation_number"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
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
 * A **Buyer Statement**: the milk buyer's own account of a stretch of farm days — the liters he counted, what he pays for
 * them, and as he says, the average fat and SNF and the rate he set from them — with its number and date. Recorded, it
 * prices every Dispatch to him in those days whose price was to follow, by its liters' share of what is left of the
 * amount once the milk already priced is taken off, and so makes what he owes for them his Receivable (ADR 0030). Voided
 * by the Owner with a reason, never deleted: the milk it priced goes back to price to follow.
 */
export const buyerStatement = pgTable(
  "buyer_statement",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    /** The statement's own number, when the buyer prints one. */
    number: text("number"),
    /** The farm days ("YYYY-MM-DD") it covers, both counted, and the day it is dated. */
    fromDay: text("from_day").notNull(),
    toDay: text("to_day").notNull(),
    statedOn: text("stated_on").notNull(),
    /** The day he pays it by: what the milk it priced is owed by. */
    payBy: text("pay_by").notNull(),
    /** The buyer's count of the liters, and what he pays for them. */
    liters: numeric("liters", { precision: 10, scale: 2 }).notNull(),
    amountMoney: numericMoney("amount_money").notNull(),
    fatPercent: numeric("fat_percent", { precision: 4, scale: 2 }),
    snfPercent: numeric("snf_percent", { precision: 4, scale: 2 }),
    ratePerLiterMoney: numeric("rate_per_liter_money", {
      precision: 8,
      scale: 2,
    }),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    voidedBy: text("voided_by").references(() => user.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  },
  (table) => [
    index("buyer_statement_buyer_idx").on(
      table.farmId,
      table.counterpartyId,
      table.fromDay
    ),
    /** One number once for a buyer, among the statements standing. */
    uniqueIndex("buyer_statement_number_uidx")
      .on(table.farmId, table.counterpartyId, sql`lower(${table.number})`)
      .where(sql`${table.voidedAt} is null and ${table.number} is not null`),
    check("buyer_statement_days", sql`${table.toDay} >= ${table.fromDay}`),
    check("buyer_statement_liters_not_negative", sql`${table.liters} >= 0`),
    check(
      "buyer_statement_rate_per_liter_money_not_negative",
      sql`${table.ratePerLiterMoney} >= 0`
    ),
    check(
      "buyer_statement_amount_money_not_negative",
      sql`${table.amountMoney} >= 0`
    ),
    check(
      "buyer_statement_recorded_by_role_known",
      sql`${table.recordedByRole} IN ('owner', 'manager', 'staff', 'vet')`
    ),
  ]
);

/** A photograph of a Buyer Statement, kept apart from it so a list of statements does not carry every image. */
export const buyerStatementPhoto = pgTable("buyer_statement_photo", {
  statementId: text("statement_id")
    .primaryKey()
    .references(() => buyerStatement.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Bulk milk handed over to a buyer: when, how many liters, to whom, the delivery note the buyer's collector
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
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull(),
    liters: numeric("liters", { precision: 10, scale: 2 }).notNull(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => counterparty.id),
    /** The buyer's name and address as they stood when the milk left. The dispatch record reprints
     *  what the farm could show that day, not wherever the buyer has moved to since. */
    buyerName: text("buyer_name").notNull(),
    buyerAddress: text("buyer_address"),
    /** The collector's slip number, when the buyer gives one. A buyer at the gate may not. */
    deliveryNote: text("delivery_note"),
    /** Nothing while its price is to follow: a processor's collection centre sets it from the fat and SNF it tested,
     *  on its **Buyer Statement**. */
    pricePerLiterMoney: numeric("price_per_liter_money", {
      precision: 8,
      scale: 2,
    }),
    /** The Buyer Statement that priced it, where its price was to follow: its milk then came to its Receivable. */
    buyerStatementId: text("buyer_statement_id").references(
      () => buyerStatement.id
    ),
    fatPercent: numeric("fat_percent", { precision: 4, scale: 2 }),
    snfPercent: numeric("snf_percent", { precision: 4, scale: 2 }),
    /** What the buyer still owed for this milk when it left — its **Receivable**. Nothing for milk paid for at the gate, as
     *  every Dispatch before Receivable was written down was. Its Money Event is what the milk came to, less this. */
    receivableMoney: numericMoney("receivable_money").notNull().default(0),
    /** The farm day ("YYYY-MM-DD") the buyer promised to pay by, when he promised one. A milk buyer who pays on a
     *  round often names none. */
    promisedBy: text("promised_by"),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("dispatch_farm_idx").on(table.farmId, table.dispatchedAt),
    index("dispatch_buyer_statement_idx").on(table.buyerStatementId),
    /** A statement prices only milk whose price was to follow. */
    check(
      "dispatch_priced_once",
      sql`${table.buyerStatementId} is null or ${table.pricePerLiterMoney} is null`
    ),
    /** Milk whose price is still to follow is owed nothing yet. */
    check(
      "dispatch_to_follow_owes_nothing",
      sql`${table.pricePerLiterMoney} is not null or ${table.buyerStatementId} is not null or ${table.receivableMoney} = 0`
    ),
  ]
);
