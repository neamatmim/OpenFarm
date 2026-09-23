import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { counterparty } from "./fattening";
import { drugProduct } from "./health";
import { SIDES, animal } from "./herd";
import { taka } from "./taka";
import { venture } from "./venture";

/** Which way money went: into the farm, or out of it. */
export const MONEY_DIRECTIONS = ["in", "out"] as const;
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number];

/** How money changed hands. Cash at the gate, bKash on a phone, or through a bank. */
export const PAYMENT_METHODS = ["cash", "bkash", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * The farm records that make money on their own. A Money Event made by one of these names it, and one
 * record makes one Money Event: a Correction to the record corrects its money rather than adding more.
 */
export const RECORD_SOURCES = [
  "dispatch",
  "intake",
  "buying_trip",
  "selling_trip",
  "sale",
  "feed_in",
  "medicine_purchase",
  "vet_fee",
  // The Farm's own side of an Internal Sale. Two sources rather than one, because the same act is money
  // in when the Farm lets an animal go and money out when it takes one on, and a source carries one
  // Category with one direction.
  "internal_sale_in",
  "internal_sale_out",
  // What a Venture repaid the Farm for what its Animals consumed of what the Farm bought.
  "reimbursement",
  // A supplementary payout on a Settlement Adjustment. The Farm's own money: the Venture Account closed
  // when the Settlement was paid, and news landing after that is the Farm's to make good.
  "settlement_adjustment",
  // What the Farm earned for managing a Venture, taken out of its account at Settlement. The one part
  // of a Settlement that is the Farm's income — an Investor's payout is his own capital and profit
  // going home, and is never the Farm's.
  "farm_share",
  // The Farm's share of a Venture's loss, paid into its account at Settlement: the mirror of `farm_share`,
  // and money out of the Farm's own books, because it is the Farm carrying its part of a run that lost.
  "farm_loss",
] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

/** Where a Money Event came from: one of the records, or entered by hand by the Manager — wages, and
 *  everything no record catches, where the Money Event is the whole of it. */
export const MONEY_SOURCES = [...RECORD_SOURCES, "by_hand"] as const;
export type MoneySource = (typeof MONEY_SOURCES)[number];

/**
 * The standard Categories every farm starts with: one for each record that makes money, and the ones a
 * dairy farm's month is otherwise made of. Keyed, so the records and the wage rule can find them; the
 * farm's own Categories carry no key.
 */
export const CATEGORY_KEYS = [
  ...RECORD_SOURCES,
  "wages",
  "utilities",
  "repairs",
  "hygiene",
  "equipment",
  "transport",
  "manure_sales",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * Where a Money Event stands with the Owner. Under the Approval Threshold it needs nobody; over it, it
 * waits until the Owner approves it. The record that made it is never held back — only the money is
 * (the Owner's decision, 2026-09-13).
 */
export const MONEY_APPROVALS = ["not_needed", "awaiting", "approved"] as const;
export type MoneyApproval = (typeof MONEY_APPROVALS)[number];

/**
 * A Category a Money Event falls under. The standard ones carry a key; the farm's own carry none. Retired,
 * never removed.
 */
export const moneyCategory = pgTable(
  "money_category",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Which standard Category this is; null for one the farm added. */
    key: text("key", { enum: CATEGORY_KEYS }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    direction: text("direction", { enum: MONEY_DIRECTIONS }).notNull(),
    /** Whether money entered by hand under this Category is charged to the animals of its Side, split by
     *  the days each stood on the farm that month: a Vet visit that named nobody, lab tests, fly spray.
     *  The Owner's mark. Wages, utilities, repairs and shed hygiene are never marked — they are the place
     *  and the people, and they stay the Farm's. */
    chargedToAnimals: boolean("charged_to_animals").notNull().default(false),
    /** Retired, never removed: a Money Event entered under it last year still names it. */
    retiredAt: timestamp("retired_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("money_category_key_uidx").on(table.farmId, table.key),
    uniqueIndex("money_category_name_uidx").on(table.farmId, table.nameBn),
  ]
);

/**
 * One flow of money in or out of the Farm: how much, when, which way, under what Category, with whom, how
 * it was paid, and the record that caused it.
 *
 * Not a ledger: an income and expense record the accountant keeps the books from.
 */
export const moneyEvent = pgTable(
  "money_event",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: MONEY_DIRECTIONS }).notNull(),
    amountBdt: taka("amount_bdt").notNull(),
    /** When the money moved, as the record that caused it says. */
    occurredAt: timestamp("occurred_at").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => moneyCategory.id),
    counterpartyId: text("counterparty_id").references(() => counterparty.id),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
    /** The record that made it, and that record's id. */
    source: text("source", { enum: MONEY_SOURCES }).notNull(),
    sourceId: text("source_id").notNull(),
    /** What the Manager wrote about money entered by hand. */
    note: text("note"),
    /** The month a wage pays for, "YYYY-MM". One wage per person per month. */
    wageMonth: text("wage_month"),
    /** The Side money entered by hand belongs to, when it belongs to one; null for the whole farm. */
    side: text("side", { enum: SIDES }),
    /** The **Purse** whose money this was: null for the Farm's own, or the Venture it belonged to. The
     *  Farm's reports read the Farm's purse alone, so money that was never the Farm's is never counted
     *  as its income or its cost. Everything recorded before Ventures existed is the Farm's. */
    purseVentureId: text("purse_venture_id").references(() => venture.id),
    approval: text("approval", { enum: MONEY_APPROVALS }).notNull(),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("money_event_source_uidx").on(table.source, table.sourceId),
    index("money_event_day_idx").on(table.farmId, table.occurredAt),
    index("money_event_approval_idx").on(table.farmId, table.approval),
    // One wage per person per month. Entries that are not wages carry no month, and do not collide.
    //
    // The Purse is deliberately not in here. Postgres counts NULLs as distinct, and the Farm's purse is
    // NULL, so adding it would stop the Farm's own wages colliding at all — the one thing this index is
    // for. A wage is the Farm's anyway: the Farm provides the labour, which is the whole of what it
    // brings to a Venture.
    uniqueIndex("money_event_wage_uidx").on(
      table.farmId,
      table.counterpartyId,
      table.wageMonth
    ),
  ]
);

/** The photo of a Money Event's receipt, when somebody took one. One per Money Event. */
export const moneyReceipt = pgTable("money_receipt", {
  moneyEventId: text("money_event_id")
    .primaryKey()
    .references(() => moneyEvent.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * Medicine bought for the Drug List: which product, how much of it in the words on the box, what it
 * cost, who sold it, and roughly how many doses it holds — which is what a dose given is costed from
 * (the Owner's decision, 2026-09-13).
 */
export const medicinePurchase = pgTable(
  "medicine_purchase",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    drugProductId: text("drug_product_id")
      .notNull()
      .references(() => drugProduct.id),
    /** How much, as the box or the shop says it: "10 vials", "500 ml". */
    quantity: text("quantity").notNull(),
    doses: integer("doses").notNull(),
    priceBdt: taka("price_bdt").notNull(),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    /** The farm's day it was bought. */
    purchasedOn: timestamp("purchased_on").notNull(),
    /** The Lot Number printed on the box, which traces a dose back to what was in it. Null for medicine
     *  written down before the farm asked. */
    lotNumber: text("lot_number"),
    /** The last day the box says it may be used, as the farm's own day ("2039-08-31"). What the store is
     *  warned about, and what a dose given after it is said of. */
    expiresOn: text("expires_on"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    index("medicine_purchase_product_idx").on(
      table.farmId,
      table.drugProductId,
      table.purchasedOn
    ),
  ]
);

/**
 * The Vet's own fee for a visit, entered by the Vet: how much, the day, and the animals seen when the
 * Vet names them — which is what the fee is charged to.
 */
export const vetFee = pgTable(
  "vet_fee",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    vetId: text("vet_id")
      .notNull()
      .references(() => user.id),
    amountBdt: taka("amount_bdt").notNull(),
    /** The farm's day of the visit. */
    visitedOn: timestamp("visited_on").notNull(),
    note: text("note"),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [index("vet_fee_vet_idx").on(table.farmId, table.vetId)]
);

/** An animal the Vet saw on a visit they charged for. */
export const vetFeeAnimal = pgTable(
  "vet_fee_animal",
  {
    vetFeeId: text("vet_fee_id")
      .notNull()
      .references(() => vetFee.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id),
  },
  (table) => [primaryKey({ columns: [table.vetFeeId, table.animalId] })]
);
